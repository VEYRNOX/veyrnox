import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/lib/WalletProvider";
import {
  parseBackupFile,
  restoreWithPassword,
  decryptPinSeal,
  finalisePinRestore,
  downloadBackupFile,
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
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
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
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
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
  // Re-authorize the export with the credential the user ACTUALLY unlocks with
  // (verifyActiveCredential + optional Action Password), not the raw vault key.
  const { requireTwoFactor, gateModal } = useActionGuard();

  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Backup is only available in the primary session. Switch to your primary wallet to create a backup.
        </p>
      </div>
    );
  }

  // The backup password is a NEW credential the user chooses to protect the
  // file — min 8, matching the vault-password floor.
  const canExport = password.length >= 8 && pin.length >= 6 && pin === pinConfirm;

  const runExport = async () => {
    setBusy(true);
    try {
      const envelope = await createBackup(password, pin);
      // Prove the backup is actually restorable with these exact credentials
      // BEFORE downloading / claiming success — never hand the user a file they
      // can't reopen.
      await verifyBackupEnvelope(envelope, password, pin);
      downloadBackupFile(envelope);
      toast.success("Backup verified ✓ and downloaded — it opens with this password or PIN.");
      setPassword(""); setPin(""); setPinConfirm("");
    } catch (err) {
      toast.error(err?.message || "Backup failed.");
    } finally {
      setBusy(false);
    }
  };

  // Gate the export behind 2FA (no-op if no second factor is configured), then
  // seal the already-unlocked wallet under the chosen backup password + PIN.
  const handleExport = () => {
    if (!canExport) return;
    requireTwoFactor(() => { runExport(); }, { title: 'Create encrypted backup' });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border bg-card/50 space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground text-sm">What the backup file contains</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Your encrypted wallet container — no seed is ever stored in plaintext.</li>
          <li>Two sealed copies: open it later with the backup password OR the backup PIN you choose below.</li>
          <li>No wallet addresses, no transaction history, no personal data.</li>
        </ul>
        <p className="mt-2 text-yellow-600 dark:text-yellow-400 font-medium">
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
        {password.length > 0 && password.length < 8 && (
          <p className="text-xs text-destructive">Use at least 8 characters.</p>
        )}
        <PinField label="Choose a backup PIN (6–12 digits)" value={pin} onChange={setPin} />
        <PinField label="Confirm backup PIN" value={pinConfirm} onChange={setPinConfirm} />
        {pin.length >= 4 && pinConfirm.length >= 4 && pin !== pinConfirm && (
          <p className="text-xs text-destructive">PINs do not match.</p>
        )}
        {pin.length >= 6 && pin.length < 8 && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            A PIN shorter than 8 digits can be brute-forced offline if someone
            gets this file. Use 8+ digits or rely on the backup password for
            strongest protection.
          </p>
        )}
      </div>

      <button
        onClick={handleExport}
        disabled={!canExport || busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Creating & verifying…" : "Download backup file"}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Save the downloaded <span className="font-mono">veyrnox.enc</span> file to iCloud, Google Drive, a USB drive, or anywhere you control.
        Only the <strong>VEYRNOX</strong> app can open it — and only with the backup password or PIN you chose.
      </p>

      {gateModal}
    </div>
  );
}

// ── Restore tab ──────────────────────────────────────────────────────────────

function RestoreTab({ lock }) {
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

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Read as bytes: the current format is a binary container; parseBackupFile
        // also accepts the legacy text formats decoded from those bytes.
        const parsed = parseBackupFile(/** @type {ArrayBuffer} */ (ev.target.result));
        setEnvelope(parsed);
        setPhase("unlock");
      } catch (err) {
        toast.error(err.message || "Invalid backup file.");
        setEnvelope(null);
        setFileName("");
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset the input so the same file can be re-selected if needed
    e.target.value = "";
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
        <div className="p-5 rounded-xl border border-green-500/30 bg-green-500/5 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
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
        <Field
          label="Confirm new password"
          type="password"
          value={newPasswordConfirm}
          onChange={setNewPasswordConfirm}
          placeholder="Repeat password"
        />
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
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
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
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="space-y-4">
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
        onClick={() => fileRef.current?.click()}
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

export default function CloudBackup() {
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
            <h1 className="text-lg font-bold leading-tight">Encrypted Backup</h1>
            <p className="text-xs text-muted-foreground">Self-custodial · on-device or personal cloud</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
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
        : <RestoreTab lock={lock} />}

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-4">
        Strongly encrypted on your device · never transmitted · only <strong>VEYRNOX</strong> can open it
      </p>
    </div>
  );
}
