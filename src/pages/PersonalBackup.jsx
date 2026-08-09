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
import { toast } from "@/lib/toast";
import BackButton from "@/components/BackButton";
import { useActionGuard } from "@/components/security/useActionGuard";
import { useRaspArtifact, sensitiveGate } from "@/rasp";
import RestoreFromFile from "@/components/backup/RestoreFromFile";
import PinPad from "@/components/security/PinPad";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordStrength";
import {
  CloudUpload, Download, Upload,
  AlertTriangle, Shield, CheckCircle2, Loader2,
  KeyRound,
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

function ExportTab({ createBackup, isDecoy, isHidden }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState("choose"); // 'choose' | 'confirm'
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState(null);   // set after successful Downloads save
  const [envelope, setEnvelope] = useState(null);     // held so user can re-save without re-encrypting
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

  const canExport = password.length >= MIN_PASSWORD_LENGTH && pin.length >= 8 && pin === pinConfirm;

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
        setPassword(""); setPin(""); setPinConfirm(""); setPinStep("choose"); setPinErr("");
      } else if (result && typeof result === "object" && !result.saved) {
        // iOS: share sheet was dismissed without saving
        toast("Backup created but not saved — tap the button to try again.");
      } else {
        // Web / desktop: anchor download triggered
        toast.success("Backup verified and saved — it opens with this password or PIN.");
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
            {pinStep === "choose" ? "Choose a backup PIN (8–12 digits)" : "Confirm backup PIN"}
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
    } finally {
      Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});
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

function RecoveryShareTab({ exportRecoveryShares, isDecoy, isHidden }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [done, setDone] = useState(false);
  const raspArtifact = useRaspArtifact();

  if (isDecoy || isHidden) {
    return (
      <div className="p-4 rounded-xl border border-warning/30 bg-warning/5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p className="text-sm">Recovery shares are unavailable in this session.</p>
      </div>
    );
  }

  // The button just gates on non-empty input. Actual credential validation
  // happens inside native.js's KEK unlock chain — wrong PIN/password throws
  // KEK_ERR.UNWRAP_FAILED, caught below and surfaced as a toast. Using
  // MIN_PASSWORD_LENGTH here would gate out the native PIN cohort (8+ digits)
  // since MIN_PASSWORD_LENGTH is the new-password floor (12), not an unlock
  // floor. Phase 2 should replace this input with PinPad on native.
  const canExport = password.length > 0;

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
      shares = await exportRecoveryShares(password);
      // Save each share as its own file. If the user cancels the share sheet
      // on iOS mid-way through, we stop and report which shares landed. The
      // shares themselves are in memory only until then; no persistence.
      for (let i = 0; i < shares.length; i++) {
        const filename = `veyrnox-recovery-${i + 1}-of-3.veyrnox-share`;
        const result = await saveShareFile(shares[i], filename);
        if (result && result.saved) {
          setSavedCount(i + 1);
        } else {
          toast("Share sheet was dismissed — some shares were not saved.");
          break;
        }
      }
      setDone(true);
      setPassword("");
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

  if (done) {
    return (
      <div className="space-y-4">
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
          <p className="font-semibold text-warning">Pre-audit preview</p>
          <p>
            This is Phase 1 of Personal Backup. There is no restore flow yet — the shares you just exported cannot
            be used to recover a wallet until Phase 2 ships. Independent audit outstanding.
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

  return (
    <div className="space-y-4">
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
        <p className="font-semibold text-warning">Pre-audit, export-only preview</p>
        <p>
          Restore is not built yet — files saved here cannot rebuild a wallet until Phase 2. Do NOT rely on this
          for real recovery. Keep using Create backup for now.
        </p>
      </div>

      <PasswordInput
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your wallet password"
        autoComplete="current-password"
      />

      <button
        onClick={runSplit}
        disabled={!canExport || busy}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Splitting…</>
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
  ? [...BASE_TABS, { id: "shares", label: "Recovery shares", Icon: KeyRound }]
  : BASE_TABS;

export default function PersonalBackup() {
  const { createBackup, exportRecoveryShares, lock, isDecoy, isHidden } = useWallet();
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
      {tab === "export" && (
        <ExportTab createBackup={createBackup} isDecoy={isDecoy} isHidden={isHidden} />
      )}
      {tab === "restore" && (
        <RestoreFromFile
          onBack={() => setTab("export")}
          onFinish={() => { lock(); navigate("/"); }}
          backLabel="Back to Create backup"
        />
      )}
      {tab === "shares" && ENABLE_PERSONAL_BACKUP_SHARDS && (
        <RecoveryShareTab
          exportRecoveryShares={exportRecoveryShares}
          isDecoy={isDecoy}
          isHidden={isHidden}
        />
      )}

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-4">
        Strongly encrypted on your device · never transmitted · only <strong>VEYRNOX</strong> can open it
      </p>
    </div>
  );
}
