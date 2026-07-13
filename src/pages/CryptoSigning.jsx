// @ts-nocheck
import { useState } from "react";
import { ethers } from "ethers";
import { Key, Copy, Check, FileSignature, AlertTriangle, Lock, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyPlain } from "@/lib/copySecret";
import { useWallet } from "@/lib/WalletProvider";
import { useMessageSigningEnabled } from "@/lib/useMessageSigningEnabled";
import { isDeniabilitySessionActive } from "@/wallet-core/deniabilitySession.js";
import { degrade, detect, TIER, browserProbeSource } from "@/rasp";
import { presignGate } from "@/sign-gate/presign";
import { LEVEL } from "@/risk/levels";

// Public-value copy helper. This page NEVER holds a private key or mnemonic:
// signing is scoped inside withPrivateKey(index, fn), which hands the key to the
// signer and lets it go out of scope. The only values copied here — the wallet
// ADDRESS and the SIGNATURE — are public, so a plain copy (no clipboard wipe) is
// correct; wiping a value the user pasted would be a bug.
export function makeCopy(setCopied) {
  return (text, key) => {
    copyPlain(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
}

export default function CryptoSigning() {
  const { accounts, isUnlocked, withPrivateKey } = useWallet();
  const signingEnabled = useMessageSigningEnabled();

  const [copied, setCopied] = useState(null);
  const [signMessage, setSignMessage] = useState("Hello from VEYRNOX!");
  const [signature, setSignature] = useState("");
  const [verifyAddress, setVerifyAddress] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState("");

  const copy = makeCopy(setCopied);

  const address = accounts?.[0]?.address || "";

  // H13: RASP pre-sign environment gate. Browser automation / WebDriver
  // (Playwright/Selenium) and other hostile-runtime tells must block signing
  // here, exactly as the Send chokepoint does. detect()/degrade() are PURE
  // functions of the environment only (I3 set-blind); a RASP crash fails closed
  // to the strongest BLOCK (I4). This page signs an arbitrary message with the
  // user's REAL wallet key, so it is a signing chokepoint and carries the gate.
  const raspGuardAllowsSigning = () => {
    let tier;
    try { tier = degrade(detect(browserProbeSource)).tier; } catch { tier = degrade(undefined)?.tier ?? TIER.BLOCK; }
    const gate = presignGate(tier, LEVEL.OK, false);
    return gate.proceedAllowed && gate.signerReachable;
  };

  const signMsg = async () => {
    setError("");
    setSignature("");
    setVerifyAddress("");
    setVerifyResult(null);
    if (!isUnlocked || !address) return;
    // I3: deniability session — signing produces a verifiable signature tied to
    // an identity the user is actively denying. Fail closed (I4).
    if (isDeniabilitySessionActive()) {
      setError("Message signing is not available in this session.");
      return;
    }
    // H13: RASP pre-sign gate. Refuse to sign in a hostile runtime (automation /
    // WebDriver). Fail closed — no signature is produced if the gate blocks.
    if (!raspGuardAllowsSigning()) {
      setError("Signing is blocked: this environment looks unsafe (automation or a tampered runtime was detected).");
      return;
    }
    try {
      // The signing primitive is IDENTICAL to WalletConnectProvider: the private
      // key is scoped inside withPrivateKey and never held by this component. It
      // signs with the ACTIVE session's wallet (decoy/hidden sessions sign with
      // their own active wallet — that is correct, not special-cased here).
      const sig = await withPrivateKey(0, async (pk) => {
        const wallet = new ethers.Wallet(pk);
        return wallet.signMessage(signMessage);
      });
      setSignature(sig);
    } catch (e) {
      setError(e?.message || "Signing failed.");
    }
  };

  const verifySignature = () => {
    if (!signature || !signMessage) return;
    try {
      const recovered = ethers.verifyMessage(signMessage, signature);
      setVerifyAddress(recovered);
      setVerifyResult(address ? recovered.toLowerCase() === address.toLowerCase() : null);
    } catch {
      setVerifyResult(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> Sign a Message</h1>
        <p className="text-sm text-muted-foreground">Sign an arbitrary text message with your wallet key (EIP-191) via ethers.js v6</p>
      </div>

      {/* C1 (I4): toggle OFF is the DEFAULT — no signing UI, honest disabled state. */}
      {!signingEnabled ? (
        <div role="status" className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card text-sm">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Message signing is turned off.</p>
            <p className="text-muted-foreground">
              Enable it in{" "}
              <Link to="/settings" className="text-primary underline underline-offset-2 inline-flex items-center gap-1">
                <SettingsIcon className="h-3.5 w-3.5" aria-hidden="true" /> Settings &rarr; Message signing
              </Link>{" "}
              to sign a message with your wallet.
            </p>
          </div>
        </div>
      ) : !isUnlocked ? (
        /* C2 (I4): unlocked-required — fail closed. */
        <div role="status" className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card text-sm">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-muted-foreground">Unlock your wallet to sign a message.</p>
        </div>
      ) : !address ? (
        /* C3: no active account (locked / not derived). */
        <div role="status" className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card text-sm">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-muted-foreground">No wallet account is available to sign with.</p>
        </div>
      ) : isDeniabilitySessionActive() ? (
        /* C4 (I3/I4): deniability session — signing is fail-closed. A signature
           is a verifiable commitment to an identity the user is actively denying;
           producing one here would undermine plausible deniability. No session
           type or identity is disclosed in the copy. */
        <div role="status" className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card text-sm">
          <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-muted-foreground">Message signing is not available in this session.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <div role="alert" className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{error}</div>}

          {/* Signing identity — the address is PUBLIC, safe to display. */}
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-sm space-y-1">
            <p className="text-muted-foreground">Signing with your wallet:</p>
            <div className="flex items-center gap-2">
              <p className="mono-value break-all flex-1">{address}</p>
              <button onClick={() => copy(address, "addr")} aria-label="Copy address">{copied === "addr" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>
            </div>
          </div>

          <div>
            <Label htmlFor="sign-message">Message to sign</Label>
            <textarea id="sign-message" value={signMessage} onChange={e => setSignMessage(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mono-value resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <Button className="w-full gap-2" onClick={signMsg}><FileSignature className="h-4 w-4" /> Sign Message (EIP-191)</Button>

          {signature && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Signature (65 bytes / 130 hex chars)</p>
                <button onClick={() => copy(signature, "sig")} aria-label="Copy signature">{copied === "sig" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}</button>
              </div>
              <p className="text-xs mono-value break-all text-muted-foreground">{signature}</p>
              <Button size="sm" variant="outline" className="w-full mt-2 text-sm" onClick={verifySignature}>Verify Signature</Button>
              {verifyAddress && (
                <div className={`p-2.5 rounded-lg text-sm ${verifyResult ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {verifyResult ? "✓ Signature valid — recovered address matches" : "✗ Address mismatch"}
                  <p className="mono-value mt-0.5">Recovered: {verifyAddress}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
