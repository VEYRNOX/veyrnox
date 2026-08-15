// pages/RestoreFromShares.jsx
//
// Cross-device (Phase 3) shard restore. Fresh phone, no vault on disk, user
// supplies 2 of 3 recovery bundles → provider reconstructs → prompt for a NEW
// PIN → importWallet re-encrypts under that PIN. See
// docs/cloud-recovery-shard-spec.md and wallet-core/shardBackup.js.

import { useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import PinPad from "@/components/security/PinPad";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useWallet } from "@/lib/WalletProvider";
import {
  tryParseRecoveryEnvelope,
  unwrapBundleWithPassphrase,
  RECOVERY_PASSPHRASE_MIN_LENGTH,
} from "@/wallet-core/recoveryShare";

const BUNDLE_ENVELOPE_TYPE = "recovery-bundle-v1";

const BACK_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground";

/** Detect whether pasted/loaded text is a passphrase-wrapped bundle envelope
 * (recovery-bundle-v1) rather than a raw bundle. Returns the parsed envelope
 * object, or null for anything else (raw bundle JSON, empty, malformed). */
function detectBundleEnvelope(text) {
  if (!text || !text.trim()) return null;
  const parsed = tryParseRecoveryEnvelope(new TextEncoder().encode(text));
  return parsed && parsed.type === BUNDLE_ENVELOPE_TYPE ? parsed : null;
}

/** Resolve a picked share's text to the raw bundle JSON string
 * combineFromBundles expects — unwrapping a passphrase envelope if the
 * detector flagged one, otherwise passing the raw bundle text through. */
async function resolveBundleText(text, envelope, passphrase) {
  if (!envelope) return text;
  const bytes = await unwrapBundleWithPassphrase(envelope, passphrase);
  return new TextDecoder().decode(bytes);
}

/** Read a File object to a text string (handles .json / .txt bundle files). */
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Could not read file."));
    r.readAsText(file);
  });
}

export default function RestoreFromShares() {
  const navigate = useNavigate();
  const { restoreFromRecoveryBundles } = useWallet();
  const [shareA, setShareA] = useState("");
  const [shareB, setShareB] = useState("");
  const [phase, setPhase] = useState("input"); // input | pin | busy
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const fileRefA = useRef(null);
  const fileRefB = useRef(null);
  // Codex P1 companion (2026-08-15): PersonalBackup's export can now save
  // share #2 as a passphrase-encrypted `.veyrnox-recovery.json` envelope
  // (recovery-bundle-v1), NOT the raw bundle this page previously assumed
  // every pasted/loaded file to be. Detect that shape per-share and prompt
  // for the passphrase that decrypts it before combining.
  const [passphraseA, setPassphraseA] = useState("");
  const [passphraseB, setPassphraseB] = useState("");

  const envelopeA = useMemo(() => detectBundleEnvelope(shareA), [shareA]);
  const envelopeB = useMemo(() => detectBundleEnvelope(shareB), [shareB]);

  const pickInto = useCallback(async (which, file) => {
    setError("");
    if (!file) return;
    try {
      const text = await readFileText(file);
      if (which === "A") setShareA(text.trim());
      else setShareB(text.trim());
    } catch (e) {
      setError((e instanceof Error && e.message) || "Could not read file.");
    }
  }, []);

  const advanceToPin = useCallback(() => {
    setError("");
    if (!shareA.trim() || !shareB.trim()) {
      setError("Provide both recovery bundles.");
      return;
    }
    if (envelopeA && passphraseA.trim().length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
      setError(`Enter the recovery passphrase for share 1 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters).`);
      return;
    }
    if (envelopeB && passphraseB.trim().length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
      setError(`Enter the recovery passphrase for share 2 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters).`);
      return;
    }
    setPhase("pin");
  }, [shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB]);

  const submitPin = useCallback(async () => {
    setError("");
    if (pin.length < 8 || pin !== pinConfirm) {
      setError("PINs do not match or are too short (8 digits).");
      return;
    }
    setPhase("busy");
    try {
      // An encrypted share is unwrapped back to its raw bundle JSON here —
      // restoreFromRecoveryBundles/combineFromBundles must never see the
      // envelope shape. Fail-closed: unwrap throws on a wrong passphrase or
      // tampered envelope, surfaced below rather than silently dropped.
      const resolvedA = await resolveBundleText(shareA.trim(), envelopeA, passphraseA);
      const resolvedB = await resolveBundleText(shareB.trim(), envelopeB, passphraseB);
      await restoreFromRecoveryBundles([resolvedA, resolvedB], pin);
      setShareA(""); setShareB(""); setPin(""); setPinConfirm("");
      setPassphraseA(""); setPassphraseB("");
      navigate("/");
    } catch (err) {
      setError((err instanceof Error && err.message) || "Restore failed.");
      setPhase("pin");
    }
  }, [pin, pinConfirm, shareA, shareB, envelopeA, envelopeB, passphraseA, passphraseB, restoreFromRecoveryBundles, navigate]);

  const ShareInput = ({ label, value, setValue, fileRef, which }) => (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40"
        >
          <Upload className="h-4 w-4" /> Pick file
        </button>
        {value && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> bundle loaded ({value.length} chars)
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,text/plain"
        className="hidden"
        onChange={(e) => pickInto(which, e.target.files?.[0])}
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Or paste JSON</summary>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='{"v":1,"shareIndex":...,"shareBytes":"...","vault":{...}}'
          className="mt-2 w-full h-28 p-2 rounded-lg border border-border bg-background font-mono text-xs"
        />
      </details>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <button type="button" onClick={() => navigate("/")} className={BACK_CHIP}>
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> Back
      </button>
      <h1 className="text-xl font-semibold">Restore from recovery shares</h1>
      <p className="text-sm text-muted-foreground">
        Load any 2 of your 3 <code>.veyrnox-bundle.json</code> files (from your device, cloud drive, USB, etc.).
        This device rebuilds the wallet and locks it under a new PIN — the seed never leaves the device.
      </p>

      {phase === "input" && (
        <div className="space-y-4">
          <ShareInput label="Share 1" value={shareA} setValue={setShareA} fileRef={fileRefA} which="A" />
          {envelopeA && (
            <PasswordInput
              value={passphraseA}
              onChange={(e) => setPassphraseA(e.target.value)}
              placeholder={`Recovery passphrase for share 1 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
            />
          )}
          <ShareInput label="Share 2" value={shareB} setValue={setShareB} fileRef={fileRefB} which="B" />
          {envelopeB && (
            <PasswordInput
              value={passphraseB}
              onChange={(e) => setPassphraseB(e.target.value)}
              placeholder={`Recovery passphrase for share 2 (min ${RECOVERY_PASSPHRASE_MIN_LENGTH} chars)`}
              autoComplete="current-password"
            />
          )}
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button
            onClick={advanceToPin}
            disabled={!shareA.trim() || !shareB.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {phase === "pin" && (
        <div className="space-y-4">
          <p className="text-sm">Choose a new 8-digit PIN for this device.</p>
          <PinPad value={pin} onChange={setPin} onComplete={setPin} submitLabel="Next" />
          <p className="text-sm">Confirm PIN.</p>
          <PinPad value={pinConfirm} onChange={setPinConfirm} onComplete={submitPin} submitLabel="Restore" />
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        </div>
      )}

      {phase === "busy" && (
        <p className="text-sm text-muted-foreground">Restoring wallet…</p>
      )}
    </div>
  );
}
