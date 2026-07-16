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
// wallet-core/vaultBackup export (parseBackupFile / restoreWithPassword /
// decryptPinSeal / finalisePinRestore). This component owns only the UI state
// machine + the RASP import gate.
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
//     unlocks with their backup credential, then the mandatory KEK enrollment gate.
//   • backLabel  — copy for the two "back" affordances (default matches the tab).
//
// RESTORING SEAM: the async Argon2id phase renders a dedicated, isolated
// <RestoreProgress /> component (phase === 'restoring') — the animation follow-up
// target. See components/backup/RestoreProgress.jsx.

import { useState, useRef, useId } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
// R2 facade — components cannot import R0/R1 wallet-core directly (ring-import-lint).
import {
  withLockSuppressed,
  parseBackupFile,
  restoreWithPassword,
  decryptPinSeal,
  finalisePinRestore,
} from '@/lib/restoreBackupFile';
import { toast } from 'sonner';
import { useRaspArtifact, sensitiveGate } from '@/rasp';
import {
  Upload, Lock, KeyRound, CheckCircle2, Loader2,
  FileText, RefreshCw, ChevronLeft, FolderOpen,
} from 'lucide-react';
import RestoreProgress from './RestoreProgress';

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

function PinField({ label, value, onChange }) {
  const fieldId = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        id={fieldId}
        type="tel"
        inputMode="numeric"
        pattern="\d*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
        placeholder="6–12 digits"
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40"
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
  const [method, setMethod] = useState('password'); // 'password' | 'pin'
  const [credential, setCredential] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [phase, setPhase] = useState('pick'); // pick | browse | unlock | restoring | setpw | done
  const [busy, setBusy] = useState(false);
  const [pinDecryptedJson, setPinDecryptedJson] = useState(null);
  const [backups, setBackups] = useState([]);
  const [listBusy, setListBusy] = useState(false);
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

  // Web (and iOS) path: <input type="file"> → FileReader.
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => ingestBytes(/** @type {ArrayBuffer} */ (ev.target.result), file.name);
    reader.readAsArrayBuffer(file);
    e.target.value = '';
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

  const handleUnlock = async () => {
    const gate = sensitiveGate(raspArtifact, 'import');
    if (gate.blocked) { toast.error(gate.sentence || 'Backup restore is disabled on this device right now.'); return; }
    setBusy(true);
    setPhase('restoring');
    try {
      if (method === 'password') {
        await restoreWithPassword(envelope, credential);
        setPhase('done');
        toast.success('Wallet restored — unlock with your original password.');
      } else {
        const containerJson = await decryptPinSeal(envelope, credential);
        setPinDecryptedJson(containerJson);
        setPhase('setpw');
      }
    } catch (err) {
      // Generic, no-oracle failure (I4): wrong credential and a corrupt/tampered
      // seal are indistinguishable to the caller.
      setPhase('unlock');
      toast.error('Wrong credential or corrupted backup.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async () => {
    // ≥12-char floor matches the on-screen hint AND finalisePinRestore's assertion.
    if (newPassword !== newPasswordConfirm || newPassword.length < 12) return;
    setBusy(true);
    setPhase('restoring');
    try {
      await finalisePinRestore(pinDecryptedJson, newPassword);
      setPhase('done');
      toast.success('Wallet restored — unlock with your new password.');
    } catch (err) {
      setPhase('setpw');
      toast.error(err.message || 'Failed to save restored wallet.');
    } finally {
      setBusy(false);
    }
  };

  // ── Render (single testid-tagged wrapper; phase drives the content) ───────────

  let content;

  if (phase === 'restoring') {
    // ISOLATED animation seam — see components/backup/RestoreProgress.jsx.
    content = <RestoreProgress method={method} />;
  } else if (phase === 'done') {
    content = (
      <div className="space-y-4">
        <div className="p-5 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Wallet restored successfully</p>
            <p className="text-xs text-muted-foreground mt-1">
              The app will lock now. Unlock with your {method === 'pin' ? 'new password' : 'original password'} to continue.
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
  } else if (phase === 'setpw') {
    const valid = newPassword.length >= 12 && newPassword === newPasswordConfirm;
    content = (
      <div className="space-y-4">
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>PIN verified. Set a new password to protect this wallet on your device.</p>
        </div>
        <Field
          label="New wallet password"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="Choose a strong password"
        />
        <p className="text-xs text-muted-foreground mt-1">At least 12 characters · any characters allowed</p>
        <Field
          label="Confirm new password"
          type="password"
          value={newPasswordConfirm}
          onChange={setNewPasswordConfirm}
          placeholder="Repeat password"
        />
        <p className="text-xs text-muted-foreground mt-1">Must match your new password</p>
        {newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm && (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        )}
        <button
          onClick={handleSetPassword}
          disabled={!valid || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? 'Saving…' : 'Save & restore'}
        </button>

        <button
          onClick={() => {
            setPinDecryptedJson(null);
            setNewPassword('');
            setNewPasswordConfirm('');
            setCredential('');
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
    const credOk = method === 'password' ? credential.length > 0 : /^\d{4,12}$/.test(credential);
    content = (
      <div className="space-y-4">
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span>Loaded: <span className="font-mono">{fileName}</span></span>
        </div>

        <p className="text-xs text-muted-foreground">
          Enter the <b>backup password or PIN you created with this file</b> — not your app unlock PIN.
        </p>

        <div className="flex gap-2">
          {['password', 'pin'].map((m) => (
            <button
              key={m}
              onClick={() => { setMethod(m); setCredential(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                method === m
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {m === 'password'
                ? <span className="flex items-center justify-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Password</span>
                : <span className="flex items-center justify-center gap-1.5"><Lock className="h-3.5 w-3.5" />PIN</span>}
            </button>
          ))}
        </div>

        {method === 'password'
          ? <Field label="Wallet password" type="password" value={credential} onChange={setCredential} placeholder="Your original password" />
          : <PinField label="Backup PIN" value={credential} onChange={setCredential} />}

        <button
          onClick={handleUnlock}
          disabled={!credOk || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Restoring…' : 'Restore wallet'}
        </button>

        <button
          onClick={() => { setEnvelope(null); setFileName(''); setCredential(''); setPhase('pick'); }}
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
          <ChevronLeft className="h-4 w-4" />
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
            <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {listBusy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading Downloads…
          </div>
        ) : backups.length === 0 ? (
          <div className="p-4 rounded-xl border border-border bg-card/50 text-xs text-muted-foreground space-y-1">
            <p className="text-foreground text-sm font-medium">No backup files found</p>
            <p>No <span className="font-mono">.enc</span> files were found in your Downloads folder. If your backup is somewhere else, use “Browse other location”.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {backups.map((f) => (
              <li key={f.uri}>
                <button
                  onClick={() => openListedFile(f)}
                  disabled={busy}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50 hover:bg-secondary/40 text-left transition-colors disabled:opacity-50"
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
    // phase === 'pick'
    content = (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Upload className="h-3 w-3 rotate-180" />
          {backLabel}
        </button>
        <div className="p-4 rounded-xl border border-border bg-card/50 space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-sm">Restoring from backup</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li>Pick your <span className="font-mono">.enc</span> backup file.</li>
            <li>Open with its password or PIN.</li>
            <li>If using PIN, set a new app password next.</li>
            <li>Replaces the current wallet on this device.</li>
          </ul>
        </div>

        <button
          onClick={startSelect}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-card/50 hover:bg-secondary/40 text-sm text-muted-foreground transition-colors"
        >
          <Upload className="h-4 w-4" />
          Select backup file
        </button>
        <input ref={fileRef} type="file" accept=".enc,.json" onChange={handleFile} className="hidden" />
      </div>
    );
  }

  return <div data-testid="restore-from-file">{content}</div>;
}
