// @ts-nocheck
import { useState, useId } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useWallet } from "@/lib/WalletProvider";
import {
  downloadBackupFile,
  downloadBackupFilePicker,
  verifyBackupEnvelope,
} from "@/wallet-core/vaultBackup";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { useActionGuard } from "@/components/security/useActionGuard";
import { useRaspArtifact, sensitiveGate } from "@/rasp";
import RestoreFromFile from "@/components/backup/RestoreFromFile";
import {
  CloudUpload, Download, Upload,
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
          Choose a backup password and PIN now — different from your app unlock PIN, not stored in the file. Forget both and your funds are gone forever.
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


// ── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "export", label: "Create backup", Icon: CloudUpload },
  { id: "restore", label: "Restore", Icon: Upload },
];

export default function PersonalBackup() {
  const { createBackup, lock, isDecoy, isHidden } = useWallet();
  const navigate = useNavigate();
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
        : <RestoreFromFile
            onBack={() => setTab("export")}
            onFinish={() => { lock(); navigate("/"); }}
            backLabel="Back to Create backup"
          />}

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-4">
        Strongly encrypted on your device · never transmitted · only <strong>VEYRNOX</strong> can open it
      </p>
    </div>
  );
}
