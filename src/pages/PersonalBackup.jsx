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
import {
  CloudUpload, Download, Upload, Lock, KeyRound,
  AlertTriangle, Shield, CheckCircle2, Loader2,
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

// ── Export tab ───────────────────────────────────────────────────────────────

function ExportTab({ createBackup, isDecoy, isHidden }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState(null);   // set after successful Downloads save
  const [envelope, setEnvelope] = useState(null);     // held so user can re-save without re-encrypting
  const { gateModal } = useActionGuard();
  const isIos = Capacitor.getPlatform() === "ios";

  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Backup is only available in the primary session. Switch to your primary wallet to create a backup.
        </p>
      </div>
    );
  }

  const canExport = password.length >= 8 && pin.length >= 8 && pin === pinConfirm;

  const runExport = async () => {
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
        <p className="font-medium text-foreground text-sm">What the backup file contains</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Your encrypted wallet container — no seed is ever stored in plaintext.</li>
          <li>Two sealed copies: open it later with the backup password OR the backup PIN you choose below.</li>
          <li>No wallet addresses, no transaction history, no personal data.</li>
        </ul>
        <p className="mt-2 text-caution font-medium">
          Choose a backup password and PIN now — they are not your app unlock PIN, and they are not stored in the file.
          If you forget both, there is no recovery — this is self-custody.
        </p>
        <p className="mt-1">
          The PIN-sealed copy uses a deliberately slow, memory-hard key derivation — strong, but a short PIN has limited entropy.
          Use the backup password for the highest-security recovery path.
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
          ? <>Saves <span className="font-mono">veyrnox.enc</span> — choose where to store it (Files, iCloud, OneDrive, etc.).</>
          : <>Saves <span className="font-mono">veyrnox.enc</span> to your Downloads folder.</>}
        {" "}Only <strong>VEYRNOX</strong> can open it — and only with the backup password or PIN you chose.
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
  const [phase, setPhase] = useState("pick"); // pick | unlock | setpw | done
  const [busy, setBusy] = useState(false);
  const [pinDecryptedJson, setPinDecryptedJson] = useState(null);

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

  const handleUnlock = async () => {
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
    if (newPassword !== newPasswordConfirm || newPassword.length === 0) return;
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
    const valid = newPassword.length > 0 && newPassword === newPasswordConfirm;
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
          Enter the <b>backup password</b> or <b>backup PIN you chose when you created this file</b> —
          not your app unlock PIN.
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
        <p className="font-medium text-foreground text-sm">Restoring from a backup</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Choose the <span className="font-mono">.enc</span> backup file you saved earlier.</li>
          <li>Open it with your password or PIN from when it was created.</li>
          <li>If you use your PIN, you will be asked to set a new password for this device.</li>
          <li>This replaces whatever wallet is currently on this device.</li>
        </ul>
      </div>

      <button
        onClick={pickFile}
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
