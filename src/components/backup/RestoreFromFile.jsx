// @ts-nocheck
// components/backup/RestoreFromFile.jsx
//
// SHARED encrypted-.enc-backup restore flow. Extracted verbatim (behaviour-
// preserving) from PersonalBackup.jsx's former inline RestoreTab so that BOTH
// surfaces render ONE component:
//   • PersonalBackup.jsx  — post-unlock "Restore" tab (existing behaviour).
//   • WalletEntry.jsx     — fresh-install onboarding "Restore from backup file".
//
// The crypto and file I/O are REUSED, never reimplemented — every operation calls a
// wallet-core/vaultBackup export (parseBackupFile / decryptPasswordSeal /
// decryptPinSeal / finalisePinRestore). This component owns only the UI state
// machine + the RASP import gate.
//
// RESTORE→PIN COHORT (owner decision 2026-07-16):
// Both backup-credential paths (password seal, PIN seal) decrypt the container
// JSON and then re-wrap it under a fresh 8-digit ON-DEVICE PIN via
// finalisePinRestore. The restored vault is ALWAYS PIN-cohort — unlock and the
// hardware-KEK gate both use the PIN. This eliminates the "forced password reset
// after restore breaks KEK enrollment" bug: KEK enrollment expects a PIN, and the
// vault is encrypted under that same PIN.
//
// SECURITY / DENIABILITY (unchanged from the original RestoreTab):
//   • RASP: every restore is gated by sensitiveGate(raspArtifact, 'import') — a
//     hooked/tampered/integrity-unavailable device refuses key import (I4). Restore
//     writes local seed material, so the ON-DEVICE probe axis is the relevant one.
//   • Wrong credential AND corrupt file BOTH surface the SAME generic error
//     ("Wrong credential or corrupted backup.") — no oracle distinguishing which.
//   • I3: no wallet-set handle, no egress.
//
// PARAMETRISED so each caller decides where a completed restore routes:
//   • onBack()   — the caller's back affordance (tab switch / view change).
//   • onFinish() — invoked from the DONE screen's single action. PersonalBackup
//     locks + navigates to "/"; onboarding routes into the unlock screen so the user
//     unlocks with their new device PIN, then the mandatory KEK enrollment gate.
//   • backLabel  — copy for the two "back" affordances (default matches the tab).
//
// RESTORING SEAM: the async Argon2id phase renders a dedicated, isolated
// <RestoreProgress /> component (phase === 'restoring') — the animation follow-up
// target. See components/backup/RestoreProgress.jsx.

import { useState, useRef, useId, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  withLockSuppressed,
  parseBackupFile,
  decryptPasswordSeal,
  decryptPinSeal,
  finalisePinRestore,
} from '@/lib/restoreBackupFile';
import { toast } from '@/lib/toast';
import { useRaspArtifact, sensitiveGate } from '@/rasp';
import {
  Upload, Lock, CheckCircle2, Loader2,
  FileText, RefreshCw, ChevronLeft, FolderOpen,
} from 'lucide-react';
import RestoreProgress from './RestoreProgress';
import Spinner from '@/components/Spinner';
import PinPad from '@/components/security/PinPad';
import { PasswordInput } from '@/components/ui/PasswordInput';

// ── Local field helpers (kept in sync with PersonalBackup's originals) ──────────

function Field({ label, type = 'text', value, onChange, placeholder }) {
  const fieldId = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(epochSeconds) {
  const s = Number(epochSeconds);
  if (!Number.isFinite(s) || s <= 0) return '';
  try { return new Date(s * 1000).toLocaleString(); } catch { return ''; }
}

export default function RestoreFromFile({ onBack, onFinish, backLabel = 'Back to Create backup' }) {
  const fileRef = useRef(null);
  const [envelope, setEnvelope] = useState(null);
  const [fileName, setFileName] = useState('');
  // Two stacked credential fields — the backup file carries BOTH a password seal
  // and a PIN seal, so the user simply fills whichever they have (no confusing
  // either/or toggle). Whichever they use, we DECRYPT the seal to the container and
  // then re-wrap it under a fresh on-device 8-digit PIN — so the restored vault is
  // ALWAYS PIN-cohort (unlock + hardware-KEK both use the PIN). Owner decision
  // 2026-07-16.
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [devicePin, setDevicePin] = useState('');
  const [devicePinConfirm, setDevicePinConfirm] = useState('');
  const [pinStep, setPinStep] = useState('choose'); // 'choose' | 'confirm'
  const [pinEntry, setPinEntry] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [phase, setPhase] = useState('pick'); // pick | browse | unlock | restoring | setpin | done
  const [busy, setBusy] = useState(false);
  const [decryptedContainer, setDecryptedContainer] = useState(null);
  const [restoredVia, setRestoredVia] = useState('password');
  const [backups, setBackups] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  // Slice I: Recovery Bay drop-zone state — decorative hover + fail-closed
  // extension error, independent of the pick/browse/unlock state machine.
  const [dropHover, setDropHover] = useState(false);
  const [dropError, setDropError] = useState('');
  // Slice I: reads prefers-reduced-motion directly (same query EntryTiles
  // gates its lamp-cone animation on) rather than via motion/react's hook —
  // read at mount so a jsdom matchMedia stub set before render is honoured.
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    setReduceMotion(Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  }, []);
  // excludeAttestation: restore is local seed-material (import). It must NOT be
  // gated on the REMOTE Play-Integrity leg — unavailable by design on any
  // sideloaded/non-Play-Store build (Google 404 → INTEGRITY_UNAVAILABLE → restore
  // blocked). Genuine ON-DEVICE threats (root/jailbreak, tamper, hook) still block.
  // Owner decision 2026-07-16. Same treatment as every other seed-material surface.
  const raspArtifact = useRaspArtifact({ excludeAttestation: true });

  const isAndroid = Capacitor.getPlatform() === 'android';

  // Parse already-read bytes into an envelope and advance to unlock.
  const ingestBytes = (bytes, name) => {
    try {
      const parsed = parseBackupFile(bytes);
      setFileName(name);
      setEnvelope(parsed);
      setPhase('unlock');
    } catch (err) {
      toast.error(err.message || 'Invalid backup file.');
      setEnvelope(null);
      setFileName('');
    }
  };

  // Shared web-path file read: <input type="file"> AND the Recovery Bay
  // dropzone both funnel here so both reach the exact same envelope handler.
  const readFileAndIngest = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => ingestBytes(/** @type {ArrayBuffer} */ (ev.target.result), file.name);
    reader.readAsArrayBuffer(file);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAndIngest(file);
    e.target.value = '';
  };

  // Drop handler: fail closed on anything that isn't a `.enc` file (I4) — no
  // envelope parse is even attempted for a rejected extension.
  const handleDrop = (e) => {
    e.preventDefault();
    setDropHover(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.enc')) {
      setDropError('Only .enc backup files are accepted.');
      toast.error('Only .enc backup files are accepted.');
      return;
    }
    setDropError('');
    readFileAndIngest(file);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setDropHover(true);
  };

  // Native Android path: open the system document picker via the FileSaver plugin so
  // it can be wrapped in withLockSuppressed (the picker Activity fires Capacitor's
  // pause event, which would otherwise lock the wallet mid-restore).
  const pickFile = async () => {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      try {
        const FileSaver = registerPlugin('FileSaver');
        const result = await withLockSuppressed(() => FileSaver.openFile());
        if (!result || result.cancelled) return;
        const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
        ingestBytes(bytes.buffer, result.filename || 'veyrnox.enc');
      } catch (err) {
        toast.error(err?.message || 'Could not open the file.');
      }
      return;
    }
    // iOS + web use the <input type="file"> path.
    fileRef.current?.click();
  };

  const loadBackupList = async () => {
    setListBusy(true);
    try {
      const FileSaver = registerPlugin('FileSaver');
      const { files } = await FileSaver.listBackups();
      setBackups(Array.isArray(files) ? files : []);
    } catch (err) {
      toast.error(err?.message || 'Could not read your Downloads folder.');
      setBackups([]);
    } finally {
      setListBusy(false);
    }
  };

  const startSelect = () => {
    if (isAndroid) {
      setPhase('browse');
      loadBackupList();
      return;
    }
    pickFile();
  };

  const openListedFile = async (file) => {
    setBusy(true);
    try {
      const FileSaver = registerPlugin('FileSaver');
      const result = await FileSaver.readFile({ uri: file.uri });
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      ingestBytes(bytes.buffer, result.filename || file.name || 'veyrnox.enc');
    } catch (err) {
      toast.error(err?.message || 'Could not open that file.');
    } finally {
      setBusy(false);
    }
  };

  // ── Unlock: decrypt the backup with whichever credential the user provides ────
  // Both paths decrypt to container JSON and advance to `setpin` (never save
  // directly). The container is held in state until re-wrapped under the device PIN.
  const handleUnlock = async () => {
    const gate = sensitiveGate(raspArtifact, 'import');
    if (gate.blocked) { toast.error(gate.sentence || 'Backup restore is disabled on this device right now.'); return; }
    const usePassword = unlockPassword.length > 0;
    setRestoredVia(usePassword ? 'password' : 'pin');
    setBusy(true);
    setPhase('restoring');
    try {
      const containerJson = usePassword
        ? await decryptPasswordSeal(envelope, unlockPassword)
        : await decryptPinSeal(envelope, unlockPin);
      setDecryptedContainer(containerJson);
      setPhase('setpin');
    } catch (err) {
      setPhase('unlock');
      toast.error('Wrong credential or corrupted backup.');
    } finally {
      setBusy(false);
    }
  };

  // ── Set device PIN: re-wrap the decrypted container under a fresh 8-digit PIN ──
  const handleSetPin = async () => {
    if (devicePin.length !== 8 || devicePin !== devicePinConfirm) return;
    setBusy(true);
    setPhase('restoring');
    try {
      await finalisePinRestore(decryptedContainer, devicePin);
      setDecryptedContainer(null);
      setPhase('done');
      toast.success('Wallet restored — unlock with your new PIN.');
    } catch (err) {
      setPhase('setpin');
      const detail = err?.code === 'RESTORE_SAVE_FAILED'
        ? (err.cause?.message || 'unknown error')
        : (err?.message || 'unknown error');
      toast.error('Failed to save restored wallet: ' + detail);
    } finally {
      setBusy(false);
    }
  };

  // ── Render (single testid-tagged wrapper; phase drives the content) ───────────

  let content;

  if (phase === 'restoring') {
    // ISOLATED animation seam — see components/backup/RestoreProgress.jsx.
    content = <RestoreProgress method={restoredVia} />;
  } else if (phase === 'done') {
    content = (
      <div className="space-y-4">
        <div className="p-5 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Wallet restored successfully</p>
            <p className="text-xs text-muted-foreground mt-1">
              The app will lock now. Unlock with your new PIN to continue.
            </p>
          </div>
        </div>
        <button
          onClick={onFinish}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          Lock &amp; return to unlock
        </button>
      </div>
    );
  } else if (phase === 'setpin') {
    const handlePinComplete = (pin) => {
      setPinErr('');
      if (pinStep === 'choose') {
        setDevicePin(pin);
        setPinEntry('');
        setPinStep('confirm');
        return;
      }
      if (pin !== devicePin) {
        setPinErr('PINs do not match — try again.');
        setDevicePin('');
        setPinEntry('');
        setPinStep('choose');
        return;
      }
      setDevicePinConfirm(pin);
    };
    const ready = devicePin.length === 8 && devicePinConfirm.length === 8 && devicePin === devicePinConfirm;
    content = (
      <div className="space-y-4">
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>
            {restoredVia === 'pin' ? 'Backup PIN' : 'Backup password'} verified.
            {pinStep === 'choose'
              ? ' Choose an 8-digit PIN to lock this wallet on your device.'
              : ' Enter the same PIN again to confirm.'}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            {pinStep === 'choose' ? 'Choose a device PIN' : 'Confirm device PIN'}
          </label>
          <PinPad
            value={pinEntry}
            onChange={setPinEntry}
            onComplete={handlePinComplete}
            length={8}
            submitLabel={pinStep === 'choose' ? 'Next' : 'Confirm'}
          />
        </div>
        {pinErr && <p className="text-xs text-destructive">{pinErr}</p>}
        {ready && (
          <button
            onClick={handleSetPin}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : null}
            {busy ? 'Saving…' : 'Save & restore'}
          </button>
        )}

        <button
          onClick={() => {
            setDecryptedContainer(null);
            setDevicePin('');
            setDevicePinConfirm('');
            setPinEntry('');
            setPinStep('choose');
            setPinErr('');
            setUnlockPassword('');
            setUnlockPin('');
            setEnvelope(null);
            setFileName('');
            setPhase('pick');
          }}
          disabled={busy}
          className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
        >
          ← Back to Select backup file
        </button>
      </div>
    );
  } else if (phase === 'unlock') {
    const credOk = unlockPassword.length > 0 || /^\d{4,12}$/.test(unlockPin);
    content = (
      <div className="space-y-4">
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span>Loaded: <span className="font-mono">{fileName}</span></span>
        </div>

        <p className="text-xs text-muted-foreground">
          Enter the <b>backup password or PIN you created with this file</b> — whichever you have. This is <b>not</b> your app unlock PIN.
        </p>

        {/* Both credentials shown stacked — the backup carries a password seal AND a
            PIN seal, so the user simply fills the one they remember. No toggle. */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Backup password</label>
          <PasswordInput
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            placeholder="Your original password"
          />
        </div>

        <div className="flex items-center gap-3" aria-hidden>
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Backup PIN</label>
          <PinPad value={unlockPin} onChange={setUnlockPin} length={12} />
        </div>

        <button
          onClick={handleUnlock}
          disabled={!credOk || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Restoring…' : 'Restore wallet'}
        </button>

        <button
          onClick={() => { setEnvelope(null); setFileName(''); setUnlockPassword(''); setUnlockPin(''); setPhase('pick'); }}
          className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors"
        >
          Choose a different file
        </button>

        <button
          onClick={onBack}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {backLabel}
        </button>
      </div>
    );
  } else if (phase === 'browse') {
    content = (
      <div className="space-y-4">
        <button
          onClick={() => setPhase('pick')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {/* Icon mirrors under dir="rtl" — back-navigation chevron. */}
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
          Back
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Backups in Downloads</span>
          </div>
          <button
            onClick={loadBackupList}
            disabled={listBusy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? 'motion-safe:animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {listBusy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner size="sm" label="Reading Downloads…" /> Reading Downloads…
          </div>
        ) : backups.length === 0 ? (
          <div className="p-4 rounded-xl border border-border bg-card/50 text-xs text-muted-foreground space-y-1">
            <p className="text-foreground text-sm font-medium">No backup files found</p>
            <p>No <span className="font-mono">.enc</span> files were found in your Downloads folder. If your backup is somewhere else, use "Browse other location".</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {backups.map((f) => (
              <li key={f.uri}>
                <button
                  onClick={() => openListedFile(f)}
                  disabled={busy}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50 hover:bg-secondary/40 text-start transition-colors disabled:opacity-50"
                >
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.size)} · {formatModified(f.modified)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={pickFile}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          Browse other location…
        </button>
      </div>
    );
  } else {
    // phase === 'pick' — Recovery Bay (Slice I). Same startSelect/handleFile
    // wiring as before; the dropzone is an additional entry point onto the
    // exact same ingestBytes() path.
    const animateSafe = !reduceMotion;
    content = (
      <div className="relative space-y-4">
        <style>{`
          @keyframes vx-safe-door-open { 0%, 55% { transform: rotateY(0deg); } 65%, 75% { transform: rotateY(-55deg); } 100% { transform: rotateY(0deg); } }
          @keyframes vx-safe-dial-spin { 0%, 50% { transform: rotate(0deg); } 70% { transform: rotate(360deg); } 100% { transform: rotate(360deg); } }
          @keyframes vx-safe-handle-turn { 0%, 55% { transform: rotate(0deg); } 70%, 100% { transform: rotate(-35deg); } }
          @keyframes vx-safe-glow-flash { 0%, 60%, 100% { opacity: 0; } 68% { opacity: 1; } 80% { opacity: 0; } }
          .vx-safe-door.vx-animated { animation: vx-safe-door-open 3.8s ease-in-out infinite; }
          .vx-safe-dial.vx-animated { animation: vx-safe-dial-spin 3.8s ease-in-out infinite; }
          .vx-safe-handle.vx-animated { animation: vx-safe-handle-turn 3.8s ease-in-out infinite; }
          .vx-safe-glow.vx-animated { animation: vx-safe-glow-flash 3.8s ease-in-out infinite; }
        `}</style>

        {/* Aurora + scan-grid backdrop, decorative only. */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: -1 }}>
          <div className="absolute -top-10 -start-10 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-10 -end-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(74,218,194,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(74,218,194,0.6) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Slice L: match the chip-style Back button used across the onboarding
            surfaces (WalletEntry.jsx via <BackButton>). Was a bare 12px muted-
            text button with an inverted Upload glyph (rendered visually as ↓),
            which drew the eye wrong and didn't match any other back site. */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
          {backLabel}
        </button>

        <p className="text-center text-[11px] font-semibold tracking-[0.2em] text-primary mono-value">
          RECOVERY BAY
        </p>

        <div
          data-testid="restore-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={() => setDropHover(false)}
          onDrop={handleDrop}
          className={`p-6 rounded-2xl border-2 border-dashed transition-colors space-y-4 ${
            dropHover ? 'border-primary bg-primary/5' : 'border-border bg-card/50'
          }`}
        >
          {/* Animated safe — pure decoration, keyed off prefers-reduced-motion
              the same way EntryTiles gates its lamp-cone animation. */}
          <div className="flex justify-center py-2" style={{ perspective: 400 }}>
            <div
              data-testid="safe-body"
              className="relative rounded-lg border-2 border-amber-400/70 bg-secondary/60"
              style={{ width: 110, height: 100 }}
            >
              <div
                data-testid="safe-glow"
                className={`vx-safe-glow absolute inset-0 rounded-lg bg-primary/40 blur-md ${animateSafe ? 'vx-animated' : ''}`}
              />
              <div
                data-testid="safe-door"
                className={`vx-safe-door absolute inset-1 rounded-md border border-amber-400/50 bg-secondary ${animateSafe ? 'vx-animated' : ''}`}
                style={{ transformOrigin: 'left center' }}
              >
                <div
                  data-testid="safe-dial"
                  className={`vx-safe-dial absolute top-2 start-2 h-5 w-5 rounded-full border-2 border-amber-400/80 ${animateSafe ? 'vx-animated' : ''}`}
                />
                <div
                  data-testid="safe-handle"
                  className={`vx-safe-handle absolute bottom-2 end-2 h-6 w-2 rounded-full bg-amber-400/80 ${animateSafe ? 'vx-animated' : ''}`}
                  style={{ transformOrigin: 'center' }}
                />
              </div>
            </div>
          </div>

          <p className="text-center text-sm font-medium">Drag your .enc backup here, or</p>

          <button
            onClick={startSelect}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border hover:border-primary/40 bg-card/70 hover:bg-secondary/40 text-sm text-muted-foreground transition-colors"
          >
            <Upload className="h-4 w-4" />
            Select backup file
          </button>
          {dropError && <p className="text-xs text-destructive text-center">{dropError}</p>}
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>Read your .enc file locally — nothing uploaded.</li>
          <li>Unlock with the file's password or backup PIN.</li>
          <li>Set a fresh device PIN for this app.</li>
          <li>Replaces any current wallet on this device.</li>
        </ul>

        <input ref={fileRef} type="file" accept=".enc" onChange={handleFile} className="hidden" />
      </div>
    );
  }

  return <div data-testid="restore-from-file">{content}</div>;
}
