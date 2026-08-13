// pages/RestoreFromShares.jsx
//
// Cross-device (Phase 3) shard restore. Fresh phone, no vault on disk, user
// pastes 2 of 3 recovery bundles → reconstruct DEK → decrypt vault → prompt
// for a NEW PIN → importWallet re-encrypts under that PIN. See
// docs/cloud-recovery-shard-spec.md and wallet-core/shardBackup.js.

import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import PinPad from "@/components/security/PinPad";
import { useWallet } from "@/lib/WalletProvider";
import { combineFromBundles, ENABLE_PERSONAL_BACKUP_SHARDS } from "@/wallet-core/shardBackup.js";
import { decryptVaultWithDek } from "@/wallet-core/vault.js";
import { parseVault } from "@/wallet-core/multiVault.js";

export default function RestoreFromShares() {
  const navigate = useNavigate();
  const { importWallet } = useWallet();
  const [shareA, setShareA] = useState("");
  const [shareB, setShareB] = useState("");
  const [phase, setPhase] = useState("input"); // input | pin | confirm | busy
  const [mnemonic, setMnemonic] = useState(""); // held briefly; cleared on unmount / success
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");

  const parseAndDecrypt = useCallback(async () => {
    setError("");
    if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
      setError("Shard restore is not enabled in this build.");
      return;
    }
    let dek = null;
    try {
      const { dek: d, vault } = combineFromBundles([shareA.trim(), shareB.trim()]);
      dek = d;
      const plaintext = await decryptVaultWithDek(vault, dek);
      const { container } = parseVault(plaintext);
      const w0 = container.wallets && container.wallets[0];
      if (!w0 || !w0.mnemonic) throw new Error("Vault has no wallet.");
      setMnemonic(w0.mnemonic);
      setPhase("pin");
    } catch (err) {
      setError(err?.message || "Could not combine shares.");
    } finally {
      if (dek && dek.fill) dek.fill(0);
    }
  }, [shareA, shareB]);

  const submitPin = useCallback(async () => {
    setError("");
    if (pin.length < 8 || pin !== pinConfirm) {
      setError("PINs do not match or are too short (8 digits).");
      return;
    }
    setPhase("busy");
    try {
      await importWallet(mnemonic, pin);
      // Zero secrets before nav
      setMnemonic("");
      setPin("");
      setPinConfirm("");
      navigate("/");
    } catch (err) {
      setError(err?.message || "Import failed.");
      setPhase("pin");
    }
  }, [pin, pinConfirm, mnemonic, importWallet, navigate]);

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="text-xl font-semibold">Restore from recovery shares</h1>
      <p className="text-sm text-muted-foreground">
        Paste any 2 of your 3 recovery bundles. Reconstructs your wallet and re-locks it under a new PIN on this device.
      </p>

      {phase === "input" && (
        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-wide text-muted-foreground">Share 1</label>
          <textarea
            value={shareA}
            onChange={(e) => setShareA(e.target.value)}
            placeholder='{"v":1,"shareIndex":...,"shareBytes":"...","vault":{...}}'
            className="w-full h-32 p-2 rounded-lg border border-border bg-background font-mono text-xs"
          />
          <label className="block text-xs uppercase tracking-wide text-muted-foreground">Share 2</label>
          <textarea
            value={shareB}
            onChange={(e) => setShareB(e.target.value)}
            placeholder='{"v":1,"shareIndex":...,"shareBytes":"...","vault":{...}}'
            className="w-full h-32 p-2 rounded-lg border border-border bg-background font-mono text-xs"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={parseAndDecrypt}
            disabled={!shareA.trim() || !shareB.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            Reconstruct wallet
          </button>
        </div>
      )}

      {phase === "pin" && (
        <div className="space-y-4">
          <p className="text-sm">Choose a new 8-digit PIN for this device.</p>
          <PinPad value={pin} onChange={setPin} onComplete={setPin} submitLabel="Next" />
          <p className="text-sm">Confirm PIN.</p>
          <PinPad value={pinConfirm} onChange={setPinConfirm} onComplete={submitPin} submitLabel="Restore" />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}

      {phase === "busy" && (
        <p className="text-sm text-muted-foreground">Restoring wallet…</p>
      )}
    </div>
  );
}
