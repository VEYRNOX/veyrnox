// pages/RestoreFromShares.jsx
//
// Cross-device (Phase 3) shard restore. Fresh phone, no vault on disk, user
// supplies 2 of 3 recovery bundles → provider reconstructs → prompt for a NEW
// PIN → importWallet re-encrypts under that PIN. See
// docs/cloud-recovery-shard-spec.md and wallet-core/shardBackup.js.

import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import PinPad from "@/components/security/PinPad";
import { useWallet } from "@/lib/WalletProvider";

const BACK_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground/90 hover:bg-white/[0.08] hover:text-foreground";

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
    setPhase("pin");
  }, [shareA, shareB]);

  const submitPin = useCallback(async () => {
    setError("");
    if (pin.length < 8 || pin !== pinConfirm) {
      setError("PINs do not match or are too short (8 digits).");
      return;
    }
    setPhase("busy");
    try {
      await restoreFromRecoveryBundles([shareA.trim(), shareB.trim()], pin);
      setShareA(""); setShareB(""); setPin(""); setPinConfirm("");
      navigate("/");
    } catch (err) {
      setError((err instanceof Error && err.message) || "Restore failed.");
      setPhase("pin");
    }
  }, [pin, pinConfirm, shareA, shareB, restoreFromRecoveryBundles, navigate]);

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
          <ShareInput label="Share 2" value={shareB} setValue={setShareB} fileRef={fileRefB} which="B" />
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
