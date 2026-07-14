// @ts-nocheck
import { useState, useRef, useId } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useWallet } from "@/lib/WalletProvider";
import { withLockSuppressed } from "@/wallet-core/keystore";
import {
  parseBackupFile,
  restoreWithPassword,
  decryptPinSeal,
  finalisePinRestore,
  downloadBackupFile,
  downloadBackupFilePicker,
  verifyBackupEnvelope,
} from "@/wallet-core/vaultBackup";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { useActionGuard } from "@/components/security/useActionGuard";
import { useRaspArtifact, sensitiveGate } from "@/rasp";
import {
  CloudUpload, Download, Upload, Lock, KeyRound,
  AlertTriangle, Shield, CheckCircle2, Loader2,
  FileText, RefreshCw, ChevronLeft, FolderOpen,
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
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
        placeholder="6–12 digits"
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(epochSeconds) {
  const s = Number(epochSeconds);
  if (!Number.isFinite(s) || s <= 0) return "";
  try {
    return new Date(s * 1000).toLocaleString();
  } catch {
    return "";
  }
}

// ── Export tab ───────────────────────────────────────────────────────────────

function ExportTab({ createBackup, isDecoy, isHidden }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState(null);   // set after successful Downloads save
  const [envelope, setEnvelope] = useState(null);     // held so user can re-save without re-encrypting
  const { gateModal } = useActionGuard();
  const raspArtifact = useRaspArtifact();
  const isIos = Capacitor.getPlatform() === "ios";

  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Backup only works in the main wallet. Switch to your primary wallet to back it up.
        </p>
      </div>
    );
  }

  const canExport = password.length >= 8 && pin.length >= 8 && pin === pinConfirm;

  const runExport = async () => {
    const gate = sensitiveGate(raspArtifact, 'export');
    if (gate.blocked) { toast.error(gate.sentence || 'Backup export is disabled on this device right now.'); return; }
    setBusy(true);
    try {
      const env = await createBackup(password, pin);
      await verifyBackupEnvelope(env, password, pin);
      const result = await downloadBackupFile(env);
      setEnvelope(env);
      if (result && typeof result === "object" && result.saved) {
        setSavedPath(result.path);
        setPassword(""); setPin(""); setPinConfirm("");
      } else if (result && typeof result === "object" && !result.saved) {
        // iOS: share sheet was dismissed without saving
        toast("Backup created but not saved — tap the button to try again.");
      } else {
        // Web / desktop: anchor download triggered
        toast.success("Backup verified and saved — it opens with this password or PIN.");
        setPassword(""); setPin(""); setPinConfirm("");
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

        <button
          onClick={runPickerSave}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
        >
          <CloudUpload className="h-4 w-4" />
          {busy ? "Opening…" : "Also save to a different location"}
        </button>

        <button
          onClick={() => { setSavedPath(null); setEnvelope(null); }}
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
          Choose a backup password and PIN now — different from your app unlock PIN, not stored in the file. Forget both = funds gone forever.
        </p>
        <p className="mt-1">
          Use the password for highest security. A short PIN has weaker entropy but works in a pinch.
        </p>
      </div>

      <div className="space-y-3">
        <Field
          label="Choose a backup password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="A new password to protect this backup (min 8)"
        />
        <p className="text-xs text-muted-foreground mt-1">At least 8 characters · any characters allowed</p>
        {password.length > 0 && password.length < 8 && (
          <p className="text-xs text-destructive">Use at least 8 characters.</p>
        )}
        <PinField label="Choose a backup PIN (8–12 digits)" value={pin} onChange={setPin} />
        <PinField label="Confirm backup PIN" value={pinConfirm} onChange={setPinConfirm} />
        {pin.length >= 8 && pinConfirm.length >= 8 && pin !== pinConfirm && (
          <p className="text-xs text-destructive">PINs do not match.</p>
        )}
      </div>

      <button
        onClick={() => { if (canExport) runExport(); }}
        disabled={!canExport || busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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

// ── Restore tab ──────────────────────────────────────────────────────────────

function RestoreTab({ lock, onBack }) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [envelope, setEnvelope] = useState(null);
  const [fileName, setFileName] = useState("");
  const [method, setMethod] = useState("password"); // 'password' | 'pin'
  const [credential, setCredential] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [phase, setPhase] = useState("pick"); // pick | browse | unlock | setpw | done
  const [busy, setBusy] = useState(false);
  const [pinDecryptedJson, setPinDecryptedJson] = useState(null);
  const [backups, setBackups] = useState([]);   // in-app Downloads list (Android)
  const [listBusy, setListBusy] = useState(false);
  const raspArtifact = useRaspArtifact();

  const isAndroid = Capacitor.getPlatform() === "android";

  // Shared: parse already-read bytes into an envelope and advance to unlock.
  const ingestBytes = (bytes, name) => {
    try {
      // The current format is a binary container; parseBackupFile also accepts
      // the legacy text formats decoded from those bytes.
      const parsed = parseBackupFile(bytes);
      setFileName(name);
      setEnvelope(parsed);
      setPhase("unlock");
    } catch (err) {
      toast.error(err.message || "Invalid backup file.");
      setEnvelope(null);
      setFileName("");
    }
  };

  // Web (and non-Android) path: <input type="file"> → FileReader.
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => ingestBytes(/** @type {ArrayBuffer} */ (ev.target.result), file.name);
    reader.readAsArrayBuffer(file);
    // Reset the input so the same file can be re-selected if needed
    e.target.value = "";
  };

  // Native Android path: open the system document picker through the FileSaver
  // plugin so the call can be wrapped in withLockSuppressed — the picker
  // Activity fires Capacitor's pause event, which would otherwise lock the
  // wallet mid-restore.
  const pickFile = async () => {
    const platform = Capacitor.getPlatform();
    if (platform === "android") {
      try {
        const FileSaver = registerPlugin("FileSaver");
        const result = await withLockSuppressed(() => FileSaver.openFile());
        if (!result || result.cancelled) return;
        const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
        ingestBytes(bytes.buffer, result.filename || "veyrnox.enc");
      } catch (err) {
        toast.error(err?.message || "Could not open the file.");
      }
      return;
    }
    if (platform === "ios") {
      // <input type="file"> works in WKWebView on iOS 15+ and opens the
      // native document picker (Files app). No extra plugin needed.
      fileRef.current?.click();
      return;
    }
    // Web / desktop
    fileRef.current?.click();
  };

  // Load the in-app list of .enc backups from Downloads (Android only) and
  // move to the 'browse' screen, which renders our own file list with a back
  // button — instead of dropping the user into the un-exitable system picker.
  const loadBackupList = async () => {
    setListBusy(true);
    try {
      const FileSaver = registerPlugin("FileSaver");
      const { files } = await FileSaver.listBackups();
      setBackups(Array.isArray(files) ? files : []);
    } catch (err) {
      toast.error(err?.message || "Could not read your Downloads folder.");
      setBackups([]);
    } finally {
      setListBusy(false);
    }
  };

  // Entry point for the "Select backup file" button.
  const startSelect = () => {
    if (isAndroid) {
      setPhase("browse");
      loadBackupList();
      return;
    }
    // iOS / web use the native <input type="file"> path.
    pickFile();
  };

  // Open a file chosen from the in-app Downloads list (by content:// URI).
  const openListedFile = async (file) => {
    setBusy(true);
    try {
      const FileSaver = registerPlugin("FileSaver");
      const result = await FileSaver.readFile({ uri: file.uri });
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      ingestBytes(bytes.buffer, result.filename || file.name || "veyrnox.enc");
    } catch (err) {
      toast.error(err?.message || "Could not open that file.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    const gate = sensitiveGate(raspArtifact, 'import');
    if (gate.blocked) { toast.error(gate.sentence || 'Backup restore is disabled on this device right now.'); return; }
    setBusy(true);
    try {
      if (method === "password") {
        await restoreWithPassword(envelope, credential);
        setPhase("done");
        toast.success("Wallet restored — unlock with your original password.");
      } else {
        const containerJson = await decryptPinSeal(envelope, credential);
        setPinDecryptedJson(containerJson);
        setPhase("setpw");
      }
    } catch (err) {
      toast.error("Wrong credential or corrupted backup.");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async () => {
    // 2026-07-14 audit LOW: on-screen hint says "At least 12 characters" but the
    // enforcement floor was length > 0 — a mid-length password would either be
    // silently accepted on native or fail with a generic "Failed to save" error on
    // web (validateWebVaultPassword rejection). Gate the button + the handler on
    // the same ≥12 rule the UI promises (fail-honest, I4).
    if (newPassword !== newPasswordConfirm || newPassword.length < 12) return;
    setBusy(true);
    try {
      await finalisePinRestore(pinDecryptedJson, newPassword);
      setPhase("done");
      toast.success("Wallet restored — unlock with your new password.");
    } catch (err) {
      toast.error(err.message || "Failed to save restored wallet.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Wallet restored successfully</p>
            <p className="text-xs text-muted-foreground mt-1">
              The app will lock now. Unlock with your {method === "pin" ? "new password" : "original password"} to continue.
            </p>
          </div>
        </div>
        <button
          onClick={() => { lock(); navigate("/"); }}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          Lock &amp; return to unlock
        </button>
      </div>
    );
  }

  if (phase === "setpw") {
    // 2026-07-14 audit LOW: gate must match the ≥12-char on-screen promise and
    // finalisePinRestore's ≥12 assertion (see handleSetPassword above).
    const valid = newPassword.length >= 12 && newPassword === newPasswordConfirm;
    return (
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
          {busy ? "Saving…" : "Save & restore"}
        </button>

        <button
          onClick={() => {
            // Return to the file picker; drop the decrypted secret and all
            // credentials from state so nothing sensitive lingers (I4).
            setPinDecryptedJson(null);
            setNewPassword("");
            setNewPasswordConfirm("");
            setCredential("");
            setEnvelope(null);
            setFileName("");
            setPhase("pick");
          }}
          disabled={busy}
          className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
        >
          ← Back to Select backup file
        </button>
      </div>
    );
  }

  if (phase === "unlock") {
    const credOk = method === "password" ? credential.length > 0
      : /^\d{4,12}$/.test(credential);
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span>Loaded: <span className="font-mono">{fileName}</span></span>
        </div>

        <p className="text-xs text-muted-foreground">
          Enter the <b>backup password or PIN you created with this file</b> — not your app unlock PIN.
        </p>

        {/* Method toggle */}
        <div className="flex gap-2">
          {["password", "pin"].map((m) => (
            <button
              key={m}
              onClick={() => { setMethod(m); setCredential(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                method === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {m === "password" ? <span className="flex items-center justify-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Password</span>
                : <span className="flex items-center justify-center gap-1.5"><Lock className="h-3.5 w-3.5" />PIN</span>}
            </button>
          ))}
        </div>

        {method === "password"
          ? <Field label="Wallet password" type="password" value={credential} onChange={setCredential} placeholder="Your original password" />
          : <PinField label="Backup PIN" value={credential} onChange={setCredential} />}

        <button
          onClick={handleUnlock}
          disabled={!credOk || busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Restoring…" : "Restore wallet"}
        </button>

        <button
          onClick={() => { setEnvelope(null); setFileName(""); setCredential(""); setPhase("pick"); }}
          className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors"
        >
          Choose a different file
        </button>

        <button
          onClick={onBack}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Create backup
        </button>
      </div>
    );
  }

  // In-app Downloads file list (Android) — our own screen, with a back button,
  // in place of the un-exitable system document picker.
  if (phase === "browse") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setPhase("pick")}
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
            <RefreshCw className={`h-3.5 w-3.5 ${listBusy ? "animate-spin" : ""}`} />
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
  }

  // phase === 'pick'
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Upload className="h-3 w-3 rotate-180" />
        Back to Create backup
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

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "export", label: "Create backup", Icon: CloudUpload },
  { id: "restore", label: "Restore", Icon: Upload },
];

export default function PersonalBackup() {
  const { createBackup, lock, isDecoy, isHidden } = useWallet();
  const [tab, setTab] = useState("export");

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
      {tab === "export"
        ? <ExportTab createBackup={createBackup} isDecoy={isDecoy} isHidden={isHidden} />
        : <RestoreTab lock={lock} onBack={() => setTab("export")} />}

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-4">
        Strongly encrypted on your device · never transmitted · only <strong>VEYRNOX</strong> can open it
      </p>
    </div>
  );
}
