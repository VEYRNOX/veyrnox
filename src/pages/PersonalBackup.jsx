// @ts-nocheck
import { useState, useId } from "react";
import { useNavigate } from "react-router";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { useWallet } from "@/lib/WalletProvider";
import {
  downloadBackupFile,
  downloadBackupFilePicker,
  verifyBackupEnvelope,
} from "@/wallet-core/vaultBackup";
import { ENABLE_PERSONAL_BACKUP_SHARDS } from "@/wallet-core/shardBackup";
import {
  unwrapShareWithPassphrase,
  wrapBundleWithPassphrase,
  tryParseRecoveryEnvelope,
  checkRecoveryPassphrase,
  RECOVERY_PASSPHRASE_MIN_LENGTH,
  ENVELOPE_TYPE_BUNDLE,
} from "@/wallet-core/recoveryShare";
import { markPersonalBackupExported } from "@/lib/personalBackupState";
import {
  markBackupCompleted,
  markBackupPendingConfirmation,
  markBackupCompletedFromConfirmation,
} from "@/lib/backupNag";
import { toast } from "@/lib/toast";
import { useTier } from "@/lib/TierProvider";
import BackButton from "@/components/BackButton";
import { Link } from "react-router";
import { useActionGuard } from "@/components/security/useActionGuard";
import { useRaspArtifact, sensitiveGate } from "@/rasp";
import RestoreFromFile from "@/components/backup/RestoreFromFile";
import PinPad from "@/components/security/PinPad";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordStrength";
import { checkPinStrength } from "@/lib/pinStrength";
import { hasSafetyPlusAccess } from "@/lib/tier";
import {
  CloudUpload, Download, Upload,
  AlertTriangle, Shield, CheckCircle2, Loader2,
  KeyRound, Lock,
} from "lucide-react";

// ── Local helpers ────────────────────────────────────────────────────────────

function Field({ label, type = "text", value, onChange, placeholder, maxLength = undefined }) {
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
        maxLength={maxLength}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

// ── Export tab ───────────────────────────────────────────────────────────────

function ExportTab({ createBackup, isDecoy, isHidden, publicAddresses }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState("choose"); // 'choose' | 'confirm'
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState(null);   // set after successful Downloads save
  const [envelope, setEnvelope] = useState(null);     // held so user can re-save without re-encrypting
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false); // Slice G+H: "I saved it" card
  const { gateModal } = useActionGuard();
  // excludeAttestation: local seed backup/export/import must not be gated on the
  // REMOTE Play-Integrity leg (unavailable on any sideloaded build → would block
  // backup). Genuine on-device threats still block. Owner decision 2026-07-16.
  const raspArtifact = useRaspArtifact({ excludeAttestation: true });
  const isIos = Capacitor.getPlatform() === "ios";

  // I3: decoy/hidden/demo — no wallet-existence tell. Copy must not imply the presence
  // of another (primary) wallet. See ecc-multi-lens-2026-07-18.md F-P1-1.
  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Backup is temporarily unavailable.
        </p>
      </div>
    );
  }

  // 2026-08-16 audit remediation: backup file unlock via PIN branch used to
  // accept 8 digits (~10^8 offline search). Raise the floor to 12 digits so
  // the PIN branch of a stored backup has a meaningfully wider search space
  // than a phone-unlock PIN. Full audit fix is to require an alphanumeric
  // passphrase, but user copy commits to a numeric PIN — this is the smallest
  // UX-preserving upgrade. ponytail: pinned at 12 digits; upgrade to
  // alphanumeric passphrase-only when the copy can be reworked.
  const BACKUP_PIN_MIN_LENGTH = 12;
  const canExport = password.length >= MIN_PASSWORD_LENGTH && pin.length >= BACKUP_PIN_MIN_LENGTH && pin === pinConfirm;

  const runExport = async () => {
    const gate = sensitiveGate(raspArtifact, 'export');
    if (gate.blocked) { toast.error(gate.sentence || 'Backup export is disabled on this device right now.'); return; }
    setBusy(true);
    try {
      const env = await createBackup(password, pin);
      await verifyBackupEnvelope(env, password, pin);
      const result = await downloadBackupFile(env);
      setEnvelope(env);
      const addrs = Array.isArray(publicAddresses) ? publicAddresses : [];
      // Slice G+H state-machine decision (see plan §5). Two chokepoints for the
      // completion classes: SaveToFiles/DocumentManager on iOS is a definitive
      // landing; anything else (Mail/Message/absent activityType) or the
      // web/desktop anchor download requires the user to click "I saved it".
      const IOS_DEFINITIVE_ACTIVITY = /^com\.apple\.(UIKit\.activity\.SaveToFiles|DocumentManager\.)/;
      if (result && typeof result === "object" && result.saved) {
        const platform = Capacitor.getPlatform();
        if (platform === "android") {
          markBackupCompleted(addrs);
        } else if (platform === "ios") {
          if (result.activityType && IOS_DEFINITIVE_ACTIVITY.test(result.activityType)) {
            markBackupCompleted(addrs);
          } else {
            markBackupPendingConfirmation(addrs);
            setAwaitingConfirmation(true);
          }
        } else {
          markBackupPendingConfirmation(addrs);
          setAwaitingConfirmation(true);
        }
        setSavedPath(result.path);
        setPassword(""); setPin(""); setPinConfirm(""); setPinStep("choose"); setPinErr("");
      } else if (result && typeof result === "object" && !result.saved) {
        // iOS: share sheet was dismissed without saving — no backupNag mutation.
        toast("Backup created but not saved — tap the button to try again.");
      } else {
        // Web / desktop: anchor download triggered — pending until confirmed.
        // We DON'T set savedPath (there's no filesystem path to display) but we
        // still need to flip screens so the confirmation card renders — that
        // card lives inside the savedPath branch, and web has no other path
        // to reach "Yes, I saved it". Use a sentinel string.
        markBackupPendingConfirmation(addrs);
        setAwaitingConfirmation(true);
        setSavedPath("(downloaded)");
        toast("Backup file downloaded — confirm you saved it below.");
        setPassword(""); setPin(""); setPinConfirm(""); setPinStep("choose"); setPinErr("");
      }
    } catch (err) {
      toast.error(err?.message || "Backup failed.");
    } finally {
      setBusy(false);
    }
  };

  // "Choose location" — opens the system file picker with the already-verified envelope
  const runPickerSave = async () => {
    if (!envelope) return;
    setBusy(true);
    try {
      const saved = await downloadBackupFilePicker(envelope);
      if (saved) {
        setSavedPath(null);
        toast.success("Backup saved to your chosen location.");
      }
    } catch (err) {
      toast.error(err?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  // ── Saved confirmation screen ─────────────────────────────────────────────
  if (savedPath) {
    return (
      <div className="space-y-4">
        {awaitingConfirmation && (
          <div className="p-5 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3" data-testid="backup-confirmation-card">
            <AlertTriangle className="h-5 w-5 text-caution shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Did you save the backup file?</p>
              <p className="text-xs text-muted-foreground mt-1">
                Open the file where you saved it, unlock with your backup password or backup PIN, then tap "I saved it" below.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { markBackupCompletedFromConfirmation(); setAwaitingConfirmation(false); toast.success("Backup confirmed."); }}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Yes, I saved it
                </button>
                <button
                  onClick={() => setAwaitingConfirmation(false)}
                  className="flex-1 py-2 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Not yet — remind me
                </button>
              </div>
            </div>
          </div>
        )}
        {savedPath !== "(downloaded)" && (
        <div className="p-5 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">{isIos ? "Backup saved" : "Backup saved to Downloads"}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{savedPath}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {isIos
                ? "Your backup was shared to the location you chose. You can also save another copy to a different location."
                : <>Find it in your <strong>Files app → Downloads</strong>. From there you can copy it to Google Drive, Dropbox, a USB drive, or anywhere you like.</>}
            </p>
          </div>
        </div>
        )}

        {savedPath !== "(downloaded)" && (
        <button
          onClick={runPickerSave}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
        >
          <CloudUpload className="h-4 w-4" />
          {busy ? "Opening…" : "Also save to a different location"}
        </button>
        )}

        <button
          onClick={() => { setSavedPath(null); setEnvelope(null); setAwaitingConfirmation(false); }}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Create another backup
        </button>

        {gateModal}
      </div>
    );
  }

  // ── Form screen ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border bg-card/50 space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground text-sm">What's in the backup</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Your encrypted wallet — no seed in plaintext.</li>
          <li>Two ways to open it: backup password OR backup PIN (your choice).</li>
          <li>No addresses, no transaction history, no personal data.</li>
        </ul>
        <p className="mt-2 text-caution font-medium">
          Choose a backup password and PIN now — different from your app unlock PIN, not stored in the file. Forget both and your funds are gone forever.
        </p>
        <p className="mt-1">
          Use the password for highest security. A short PIN has weaker entropy but works in a pinch.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Choose a backup password</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`A new password to protect this backup (min ${MIN_PASSWORD_LENGTH})`}
            className="w-full"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">At least {MIN_PASSWORD_LENGTH} characters · any characters allowed</p>
        {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
          <p className="text-xs text-destructive">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            {pinStep === "choose" ? "Choose a backup PIN (12 digits)" : "Confirm backup PIN"}
          </label>
          <PinPad
            value={pinStep === "choose" ? pin : pinConfirm}
            onChange={(v) => { if (pinStep === "choose") setPin(v); else setPinConfirm(v); setPinErr(""); }}
            onComplete={(v) => {
              if (pinStep === "choose") {
                setPin(v);
                setPinConfirm("");
                setPinStep("confirm");
              } else {
                if (v !== pin) {
                  setPinErr("PINs don't match. Try again.");
                  setPinConfirm("");
                  setPinStep("choose");
                  setPin("");
                } else {
                  setPinConfirm(v);
                }
              }
            }}
            length={12}
            submitLabel={pinStep === "choose" ? "Next" : "Confirm"}
          />
          {pinStep === "confirm" && (
            <button type="button" onClick={() => { setPinStep("choose"); setPin(""); setPinConfirm(""); setPinErr(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Change PIN
            </button>
          )}
        </div>
        {pinErr && <p className="text-xs text-destructive">{pinErr}</p>}
      </div>

      <button
        onClick={() => { if (canExport) runExport(); }}
        disabled={!canExport || busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Creating & verifying…" : isIos ? "Save backup" : "Save backup to Downloads"}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        {isIos
          ? <>Saves <span className="font-mono">veyrnox.enc</span> where you choose (Files, iCloud, OneDrive, etc.)</>
          : <>Saves <span className="font-mono">veyrnox.enc</span> to Downloads.</>}
        {" "}Only VEYRNOX can open it — only with the password or PIN you just chose.
      </p>

      {gateModal}
    </div>
  );
}


// ── Recovery Shares tab (Personal Backup Phase 1) ───────────────────────────
// Splits the DEK into 3 shamir shares (2-of-3) and hands each to the user via
// the native share sheet. NO cloud upload, NO device Share-A persistence swap,
// NO restore flow — Phase 1 is export-only. See docs/cloud-recovery-shard-spec.md.
// Only rendered when ENABLE_PERSONAL_BACKUP_SHARDS build flag is on.

async function saveShareFile(bytes, filename) {
  const platform = Capacitor.getPlatform();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));

  if (platform === "android") {
    const FileSaver = registerPlugin("FileSaver");
    const result = await FileSaver.saveToDownloads({ data: base64, filename });
    return { saved: true, path: result.path };
  }

  if (platform === "ios") {
    // 2026-08-16 audit remediation: wrap writeFile + Share inside one try so
    // the finally deletion ALWAYS runs, even if writeFile itself throws mid-
    // write. Prior structure had writeFile outside the try, leaving a partial
    // Cache-directory file if writeFile succeeded then something before Share
    // threw. Swallowed-catch replaced with console.warn so a persistent delete
    // failure is visible to the operator (residual cache-file risk otherwise
    // invisible).
    // ponytail: Directory.Cache is still iCloud-backed on some device configs.
    // Upgrade path: Directory.Data + iOS .nobackup attribute via a Capacitor
    // plugin when one is available (not one-line right now).
    try {
      const tmp = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      try {
        const result = await Share.share({
          title: filename,
          url: tmp.uri,
          dialogTitle: "Save recovery share",
        });
        return { saved: true, path: result.activityType ? `Shared via ${result.activityType}` : "Saved via share sheet" };
      } catch (err) {
        if (err?.message?.includes("cancelled") || err?.message?.includes("dismiss")) {
          return { saved: false, path: "" };
        }
        throw err;
      }
    } finally {
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Cache });
      } catch (err) {
        console.warn('[PersonalBackup] cache delete failed', err);
      }
    }
  }

  // Web / desktop
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { saved: true, path: `Downloaded ${filename}` };
}

// Load N binary files from the user via <input type=file multiple> on
// web/iOS, or the FileSaver openFile plugin on Android. Returns an array of
// Uint8Array. On iOS Capacitor's webview supports type=file, so we use the
// same DOM path as web there.
async function pickShareFiles(minCount, maxCount) {
  const platform = Capacitor.getPlatform();

  if (platform === "android") {
    // FileSaver.openFile returns a single file at a time — call it minCount times.
    const FileSaver = registerPlugin("FileSaver");
    const files = [];
    for (let i = 0; i < minCount; i++) {
      const result = await FileSaver.openFile({ mimeType: "*/*" });
      if (!result || !result.data) throw new Error("File pick was cancelled.");
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      files.push(bytes);
    }
    return files;
  }

  // Web / iOS webview: multi-file input.
  return await new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    // Phase 3 introduced passphrase-encrypted envelopes saved as
    // `.veyrnox-recovery.json` — an accept filter that only lists
    // `.veyrnox-share` would hide those files from the OS picker on iOS/web
    // and block restore of the very files this same flow produced (Codex P1,
    // 2026-08-09). Include both extensions and their MIME types.
    input.accept = ".veyrnox-share,.veyrnox-recovery.json,.json,application/octet-stream,application/json";
    input.multiple = true;
    input.style.display = "none";
    input.onchange = async () => {
      try {
        const list = Array.from(input.files || []);
        if (list.length < minCount || list.length > maxCount) {
          reject(new Error(`Please choose ${minCount} share files.`));
          return;
        }
        const out = [];
        for (const f of list) {
          const buf = await f.arrayBuffer();
          out.push(new Uint8Array(buf));
        }
        resolve(out);
      } catch (err) {
        reject(err);
      } finally {
        try { document.body.removeChild(input); } catch { /* already gone */ }
      }
    };
    // Cancel detection isn't reliable across browsers; we accept that a
    // dismissed picker just leaves the flow idle. The user can re-click.
    document.body.appendChild(input);
    input.click();
  });
}

function RecoveryRestorePanel({ restoreFromRecoveryShares, onFinish }) {
  // pickedFiles carries raw bytes as picked from disk — either 88-byte raw
  // shares or JSON recovery envelopes. Envelopes are unwrapped only at submit
  // time, so a wrong passphrase can be re-entered without re-picking files.
  const [pickedFiles, setPickedFiles] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const raspArtifact = useRaspArtifact();

  // Cheap detection — tryParseRecoveryEnvelope does length check + JSON.parse.
  const encryptedCount = pickedFiles
    ? pickedFiles.reduce((n, f) => (tryParseRecoveryEnvelope(f) ? n + 1 : n), 0)
    : 0;
  const needsPassphrase = encryptedCount > 0;

  const runPick = async () => {
    setPickErr("");
    try {
      const picked = await pickShareFiles(2, 2);
      setPickedFiles(picked);
    } catch (err) {
      setPickErr(err?.message || "File pick failed.");
    }
  };

  const clearPickedFiles = () => {
    if (pickedFiles) for (const f of pickedFiles) if (f && f.fill) f.fill(0);
    setPickedFiles(null);
  };

  // Native is a PIN-only cohort: the unlock UI uses PinPad and only accepts a
  // numeric PIN that passes checkPinStrength. Accepting anything else here
  // would rewrite the vault under a credential the normal unlock cannot type
  // back in — locking the user out (Codex P1, 2026-08-09).
  const pinCheck = checkPinStrength(newPassword);
  const passphraseCheck = checkRecoveryPassphrase(recoveryPassphrase);
  // Codex P2 2026-08-09 — a typo in the new PIN silently locks the user out
  // (vault rewrites under mistyped credential, unlock fails, only fix is to
  // restore again). Require confirm field to match before enabling Restore.
  const pinConfirmed = newPassword === newPasswordConfirm && newPasswordConfirm.length > 0;
  const canRestore =
    pickedFiles &&
    pickedFiles.length === 2 &&
    pinCheck.ok &&
    pinConfirmed &&
    (!needsPassphrase || passphraseCheck.ok) &&
    !busy;

  const runRestore = async () => {
    const gate = sensitiveGate(raspArtifact, "export"); // reuse the same RASP surface as export
    if (gate.blocked) {
      toast.error(gate.sentence || "Recovery is disabled on this device right now.");
      return;
    }
    setBusy(true);
    // Hoisted so finally reaches on any throw from unwrap or restore — same
    // discipline as export's runSplit (Codex P2, 2026-08-09).
    // ownedByShares tracks which entries in `shares` are OURS to zero — an
    // envelope unwrap returns a fresh buffer (owned), a raw pick aliases the
    // pickedFiles buffer (NOT owned; zeroing would destroy the retry state).
    // Codex P2 2026-08-09: prior version zeroed all entries, corrupting raw
    // shares in pickedFiles after any failure — every retry then fed zeroed
    // bytes until user re-picked files.
    let shares = null;
    let ownedByShares = null;
    try {
      shares = [];
      ownedByShares = [];
      for (const f of pickedFiles) {
        const envelope = tryParseRecoveryEnvelope(f);
        // tryParseRecoveryEnvelope also matches recovery-bundle-v1 (the
        // cross-device wrap RestoreFromShares.jsx unwraps) — this same-device
        // panel only understands the single-share wrap. Reject it here with a
        // legible message instead of handing it to unwrapShareWithPassphrase,
        // which throws the internal RECOVERY_SHARE_MALFORMED code (Codex P2).
        if (envelope && envelope.type === ENVELOPE_TYPE_BUNDLE) {
          throw new Error(
            "That file is a cross-device recovery file — use Restore from recovery bundles instead."
          );
        }
        if (envelope) {
          shares.push(await unwrapShareWithPassphrase(envelope, recoveryPassphrase));
          ownedByShares.push(true);
        } else {
          shares.push(f);
          ownedByShares.push(false);
        }
      }
      const result = await restoreFromRecoveryShares(shares, newPassword);
      clearPickedFiles();
      setNewPassword("");
      setNewPasswordConfirm("");
      setRecoveryPassphrase("");
      // I4 fail-honest: if hardware capability flipped mid-restore, the outer
      // Enclave wrap could not be re-applied. Vault still unlocks via KEK +
      // PIN, but the extra defense-in-depth layer is gone until the user
      // re-enables biometrics. Do NOT swallow this — surface it explicitly.
      if (result && result.downgradedFromEnclave) {
        toast.warning(
          "Wallet recovered, but hardware wrap could not be re-applied. Re-enable biometrics in Settings to restore full protection."
        );
      } else {
        toast.success("Wallet recovered. Unlock with your new PIN.");
      }
      onFinish();
    } catch (err) {
      // fail-closed: surface the raw error so the user learns whether it was
      // a bad share set, wrong passphrase, wrong-generation shares, or a
      // KEK/hardware error.
      toast.error(err?.message || "Recovery failed.");
    } finally {
      // Zero ONLY freshly unwrapped share bytes. Raw picks alias pickedFiles
      // and must stay intact for retry — clearPickedFiles zeros them on
      // successful clear-out only.
      if (shares) {
        for (let i = 0; i < shares.length; i++) {
          if (ownedByShares[i] && shares[i] && shares[i].fill) shares[i].fill(0);
        }
      }
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Restore from 2 recovery shares</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick any 2 of the 3 share files you exported. This rebuilds the vault key on THIS device using a new PIN
          you set below. Your wallet address and history are unchanged.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 text-xs space-y-2">
        <p className="font-semibold text-warning">Same-device only</p>
        <p>
          Restore only works on a device that still has the encrypted vault. Recovering onto a brand-new device
          (device lost or reset) needs vault-ciphertext transport, which is a later phase.
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={runPick}
          disabled={busy}
          className="w-full py-2 rounded-lg border border-border text-sm hover:bg-secondary/40 flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {pickedFiles ? `Change files (${pickedFiles.length} of 2 chosen)` : "Choose 2 share files"}
        </button>
        {pickErr && <p className="text-xs text-destructive">{pickErr}</p>}
        {pickedFiles && pickedFiles.length === 2 && (
          <p className="text-xs text-muted-foreground">
            2 files loaded{encryptedCount > 0 ? ` — ${encryptedCount} is passphrase-encrypted` : ""}. Fill in the fields below to complete recovery.
          </p>
        )}
      </div>

      {needsPassphrase && (
        <div className="space-y-1">
          <PasswordInput
            value={recoveryPassphrase}
            onChange={(e) => setRecoveryPassphrase(e.target.value)}
            placeholder={`Recovery passphrase (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
            autoComplete="current-password"
          />
          {recoveryPassphrase.length > 0 && !passphraseCheck.ok && (
            <p className="text-xs text-destructive">{passphraseCheck.reason}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            The passphrase you set when exporting the encrypted share.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New PIN (digits only)"
          autoComplete="new-password"
          inputMode="numeric"
        />
        {newPassword.length > 0 && !pinCheck.ok && (
          <p className="text-xs text-destructive">{pinCheck.reason}</p>
        )}
      </div>

      <div className="space-y-1">
        <PasswordInput
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          placeholder="Confirm new PIN"
          autoComplete="new-password"
          inputMode="numeric"
        />
        {newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm && (
          <p className="text-xs text-destructive">PINs do not match.</p>
        )}
      </div>

      <button
        onClick={runRestore}
        disabled={!canRestore}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Recovering…</>
          : <><KeyRound className="h-4 w-4" /> Restore wallet</>}
      </button>
    </div>
  );
}

function RecoveryShareTab({ exportRecoveryShares, exportRecoveryBundles, restoreFromRecoveryShares, onRestoreFinish, isDecoy, isHidden }) {
  const [mode, setMode] = useState("export"); // 'export' | 'restore'
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [done, setDone] = useState(false);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const raspArtifact = useRaspArtifact();

  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm">Recovery shares are unavailable in this session.</p>
      </div>
    );
  }

  const passphraseCheck = checkRecoveryPassphrase(recoveryPassphrase);
  const canExport = pin.length === 8 && passphraseCheck.ok;

  const runSplit = async () => {
    const gate = sensitiveGate(raspArtifact, "export");
    if (gate.blocked) {
      toast.error(gate.sentence || "Recovery share export is disabled on this device right now.");
      return;
    }
    setBusy(true);
    setSavedCount(0);
    // Hoisted so the finally block below reaches them on both success and
    // any throw from saveShareFile — Codex P2, 2026-08-09. A save-path
    // exception leaves the shares live on the suspended frame until GC
    // otherwise, and any 2 of them reconstruct the DEK.
    let shares = null;
    try {
      // shares are Uint8Array[3] × 88 bytes. The DEK never crossed the
      // WalletProvider boundary — this call runs the KEK unlock chain in
      // native.js and returns only the split output.
      // Phase 3 (cross-device restore): each saved file is a self-contained
      // bundle carrying a shamir share PLUS the encrypted vault blob and
      // its hash. Any 2 bundles rebuild the wallet on a fresh device via
      // the "Restore from recovery shares" hero entry. Old raw-share saves
      // still work through same-device restore for existing users.
      const bundles = await exportRecoveryBundles(pin);
      shares = bundles.map(() => null); // placeholder for the finally-zero loop
      let completedAll = true;
      for (let i = 0; i < bundles.length; i++) {
        // 2026-08-16 audit remediation (round 3): the toggle is gone; wrap
        // every bundle unconditionally. Raw-bundle export is no longer a
        // supported path — canExport already requires passphraseCheck.ok.
        const bytesToSave = new TextEncoder().encode(
          await wrapBundleWithPassphrase(
            new TextEncoder().encode(bundles[i]),
            recoveryPassphrase,
            i + 1,
          ),
        );
        const filename = `veyrnox-recovery-${i + 1}-of-3.veyrnox-recovery.json`;
        const result = await saveShareFile(bytesToSave, filename);
        if (result && result.saved) {
          setSavedCount(i + 1);
        } else {
          toast("Share sheet was dismissed — some shares were not saved.");
          completedAll = false;
          break;
        }
      }
      // Phase 5: only record "exported" when ALL 3 files landed. Partial save
      // cannot recover a vault, so it must not lift the posture score. Helper
      // is I3-suppressed at its write site — no-op in decoy.
      if (completedAll) {
        markPersonalBackupExported({ withPassphrase: true });
      }
      setDone(true);
      setPin("");
      setRecoveryPassphrase("");
    } catch (err) {
      // fail-closed: surface the raw error code so a round-trip failure or
      // KEK issue is visible, not silently masked (I4).
      toast.error(err?.message || "Recovery share export failed.");
    } finally {
      // Best-effort zero of the in-memory shares regardless of path.
      if (shares) for (const s of shares) if (s && s.fill) s.fill(0);
      setBusy(false);
    }
  };

  const ModeToggle = (
    <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
      {[
        { id: "export", label: "Export", Icon: Download },
        { id: "restore", label: "Restore", Icon: Upload },
      ].map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  if (done) {
    return (
      <div className="space-y-4">
        {ModeToggle}
        <div className="p-5 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              {savedCount === 3 ? "All 3 recovery shares saved" : `${savedCount} of 3 shares saved`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Save each share in a different location — device, one cloud, another cloud. Any 2 of 3 can recover your wallet.
            </p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 text-xs space-y-2">
          <p>
            To recover on a new device, load any 2 of your 3 bundles from “Restore from shares”. Keep an .enc file alongside as your primary backup.
          </p>
        </div>
        <button
          onClick={() => { setDone(false); setSavedCount(0); }}
          className="w-full py-2 rounded-lg border border-border text-sm hover:bg-secondary/40"
        >
          Export another set
        </button>
      </div>
    );
  }

  if (mode === "restore") {
    return (
      <div className="space-y-4">
        {ModeToggle}
        <RecoveryRestorePanel
          restoreFromRecoveryShares={restoreFromRecoveryShares}
          onFinish={onRestoreFinish}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ModeToggle}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">2-of-3 recovery shares (preview)</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Splits your vault key into 3 pieces. Any 2 pieces can rebuild it; 1 alone reveals nothing. Save each in a
          different place (this device, one cloud, another cloud).
        </p>
      </div>

      <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 text-xs space-y-2">
        <p>
          Same-device restore ships in this build; cross-device (device lost) recovery is a later phase. Keep an
          .enc backup alongside these shares.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Enter your wallet PIN</label>
        <PinPad
          value={pin}
          onChange={setPin}
          onComplete={setPin}
          length={8}
          submitLabel="Confirm"
        />
      </div>

      <div className="p-3 rounded-xl border border-border bg-card/40 space-y-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Recovery passphrase (required)
          </p>
          <p className="text-xs text-muted-foreground">
            Every share is wrapped with Argon2id + AES-GCM. Two raw bundles
            alone can be cracked offline; wrapping removes that path.
          </p>
        </div>
        <div className="space-y-1">
          <PasswordInput
            value={recoveryPassphrase}
            onChange={(e) => setRecoveryPassphrase(e.target.value)}
            placeholder={`Recovery passphrase (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
            autoComplete="new-password"
          />
          {recoveryPassphrase.length > 0 && !passphraseCheck.ok && (
            <p className="text-xs text-destructive">{passphraseCheck.reason}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Long, memorable, written down separately. Losing this passphrase makes the shares unusable.
          </p>
        </div>
      </div>

      <button
        onClick={runSplit}
        disabled={!canExport || busy}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Encrypting…</>
          : <><Download className="h-4 w-4" /> Split & save 3 shares</>}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const BASE_TABS = [
  { id: "export", label: "Create backup", Icon: CloudUpload },
  { id: "restore", label: "Restore", Icon: Upload },
];

const TABS = ENABLE_PERSONAL_BACKUP_SHARDS
  ? [...BASE_TABS, { id: "shares", label: "Advanced (2-of-3)", Icon: KeyRound }]
  : BASE_TABS;

export default function PersonalBackup() {
  const { createBackup, exportRecoveryShares, exportRecoveryBundles, restoreFromRecoveryShares, lock, isDecoy, isHidden, getBackupPublicAddresses } = useWallet();
  const { currentTier } = useTier();
  const navigate = useNavigate();
  const [tab, setTab] = useState("export");
  // Vault backup ("Create backup" + "Restore") is free. Shard-based
  // "Advanced (2-of-3)" is Safety Plus only — tab stays visible so free
  // users can discover the feature; clicking it renders an upsell card
  // instead of the export/restore panel.
  const hasSafetyPlus = hasSafetyPlusAccess(currentTier);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Encrypted Personal Backup</h1>
            <p className="text-xs text-muted-foreground">Self-custodial · on-device or personal cloud</p>
          </div>
        </div>
      </div>

      {/* Tab bar — sticky so it stays reachable when content is long on mobile */}
      <div className="sticky top-0 z-10 flex gap-1 p-1 bg-secondary/50 rounded-xl backdrop-blur-sm">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "export" && (
        <ExportTab createBackup={createBackup} isDecoy={isDecoy} isHidden={isHidden} publicAddresses={getBackupPublicAddresses ? getBackupPublicAddresses() : []} />
      )}
      {tab === "restore" && (
        <RestoreFromFile
          onBack={() => setTab("export")}
          onFinish={() => { lock(); navigate("/"); }}
          backLabel="Back to Create backup"
        />
      )}
      {tab === "shares" && ENABLE_PERSONAL_BACKUP_SHARDS && hasSafetyPlus && (
        <RecoveryShareTab
          exportRecoveryShares={exportRecoveryShares}
          exportRecoveryBundles={exportRecoveryBundles}
          restoreFromRecoveryShares={restoreFromRecoveryShares}
          onRestoreFinish={() => { lock(); navigate("/"); }}
          isDecoy={isDecoy}
          isHidden={isHidden}
        />
      )}
      {tab === "shares" && ENABLE_PERSONAL_BACKUP_SHARDS && !hasSafetyPlus && (
        <div className="space-y-4" data-testid="shares-tab-upsell">
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Advanced 2-of-3 backup — Safety Plus</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Splits your vault key into 3 shares — any 2 rebuild it, 1 alone reveals nothing.
              Save one on this device, one in each of two clouds. Recover even if a single copy
              is lost or coerced. Included with Safety Plus.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/40 text-xs space-y-2">
            <p className="font-semibold">Personal Backup is free — this is the advanced tier.</p>
            <p className="text-muted-foreground">
              "Create backup" and "Restore" stay free for everyone. The 2-of-3 shard flow adds
              coercion resistance and single-copy loss tolerance on top.
            </p>
          </div>
          <Link
            to="/plans"
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2"
          >
            <KeyRound className="h-4 w-4" />
            See Safety Plus
          </Link>
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-4">
        Strongly encrypted on your device · never transmitted · only <strong>VEYRNOX</strong> can open it
      </p>
    </div>
  );
}
