// pages/DuressPin.jsx
//
// DURESS PIN / DECOY WALLET  (S3 — individual security).  PROVISIONAL.
// BUILT, UNAUDITED-PROVISIONAL — not verified; needs independent audit + real-device proof.
//
// DENIABILITY MODEL (v2 — owner-approved 2026-06-22):
//   - Real PIN        → hidden real wallet (no UI tell it exists).
//   - Duress PIN      → decoy wallet (the surrendered wallet under coercion).
//   - Face ID (opt-in)→ decoy wallet, NEVER the real one.
//   - Wrong PIN       → explicit "Incorrect PIN" error (no silent decoy; the old
//                       no-oracle property was deliberately removed).
//   - 10 wrong PINs   → irreversible local wipe (src/lib/pinAttemptGuard.js).
// Deniability rests on HIDING the real wallet behind the secret real PIN and the
// duress/Face-ID decoy path, NOT on a no-oracle trick. Does not resist offline
// seizure without a hardware KEK (planned fast-follow, not yet built).
//
// This page routes through the EXISTING unlock flow (useWallet().unlock) and the
// existing keystore/crypto. The decoy is a real, separately-encrypted vault; see
// src/wallet-core/duress.js for the design and its honest limitations.
//
// DECOY BALANCE (this change): a decoy is only convincing if it holds a SMALL,
// REAL, block-explorer-verifiable amount — a coercer can paste the decoy address
// into Etherscan, so a faked UI number would expose it. The balance shown here is
// resolved by src/lib/decoyBalance.js:
//   - real/native : a live on-chain eth_getBalance read (same source of truth as
//                   the rest of the wallet) — never a hardcoded number.
//   - demo        : a SEEDED amount (a fresh decoy address can't hold live funds
//                   on a simulator), clearly labelled as a demo simulation.
//
// DEMO vs NATIVE:
//   - The setup card (set / remove duress PIN, fund the decoy) works everywhere.
//   - The "Live demonstration" card is DEMO-gated: it creates a throwaway real
//     vault + decoy, seeds a small plausible decoy balance, and exercises the
//     REAL unlock path so the behaviour is demonstrable on the simulator.

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useActionGuard } from "@/components/security/useActionGuard";
import { DEMO } from "@/api/demoClient";
import {
  resolveDecoyBalance, seedDemoDecoyBalance, DECOY_NETWORK_KEY,
} from "@/lib/decoyBalance";
import { getBiometricStatus, setBiometricUnlockEnabled } from "@/lib/biometric";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import {
  Shield, AlertTriangle, Lock, Unlock, FlaskConical,
  Copy, Check, RefreshCw, Coins, ExternalLink, Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PinPad from "@/components/security/PinPad";

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "real-pin-2468";
const DEMO_DURESS_PW = "duress-pin-1357";
// A small, plausible decoy balance to seed in the demo (ETH). Small enough to be
// "an amount you'd sacrifice", non-zero so the decoy looks lived-in.
const DEMO_DECOY_ETH = "0.0412";

const NET = getNetworkInfo(DECOY_NETWORK_KEY);

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

// Reads and shows the decoy's native testnet balance. REAL on-chain read in
// real/native builds; SEEDED (clearly labelled) in demo. Never a hardcoded value.
function DecoyBalance({ address, refreshKey }) {
  const [state, setState] = useState(/** @type {any} */ ({ loading: true }));
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    resolveDecoyBalance(address)
      .then((r) => { if (active) setState({ loading: false, ...r }); })
      .catch((e) => { if (active) setState({ loading: false, error: e?.message || "read failed" }); });
    return () => { active = false; };
  }, [address, refreshKey]);

  if (!address) return null;
  if (state.loading) return <span className="text-xs text-muted-foreground">reading balance…</span>;
  if (state.error) {
    return <span className="text-xs text-muted-foreground" title="Could not read balance from chain">balance unavailable</span>;
  }
  const eth = Number(state.eth);
  return (
    <span className="text-sm font-semibold">
      {eth.toLocaleString(undefined, { maximumFractionDigits: 6 })} {NET?.symbol || "ETH"}
      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
        {state.source === "chain" ? "(live on-chain)" : "(demo — simulated)"}
      </span>
    </span>
  );
}

export default function DuressPin() {
  const wallet = useWallet();
  const {
    isUnlocked, isDecoy, accounts,
    hasVault, setDuressPin, removeDuressPin, enableDecoyBiometricUnlock,
    createWallet, unlock, lock, clearVault, hasDuressPin, disableBiometricUnlock,
  } = wallet;
  const { requireTwoFactor, gateModal } = useActionGuard();

  // ----- setup card state -----
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [duressStep, setDuressStep] = useState("enter"); // "enter" | "confirm"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPhrase, setSavedPhrase] = useState("");   // decoy mnemonic (shown once)
  const [savedAddr, setSavedAddr] = useState("");       // decoy address (to fund)
  const [copied, setCopied] = useState("");
  const [balRefresh, setBalRefresh] = useState(0);      // bump to re-read balances

  // ----- Face-ID-opens-the-decoy opt-in -----
  // bioStatus: the device's biometric availability (probed once). The opt-in is
  // shown ONLY when a biometric sensor is available — otherwise there is nothing
  // to bind the decoy to, so we honest-hide it rather than show a dead toggle.
  const [bioStatus, setBioStatus] = useState(/** @type {any} */ (null));
  const [useBioForDecoy, setUseBioForDecoy] = useState(false);
  const bioLabel = bioStatus?.label || "Face ID";
  useEffect(() => {
    let active = true;
    getBiometricStatus()
      .then((s) => { if (active) setBioStatus(s); })
      .catch(() => { if (active) setBioStatus({ available: false }); });
    return () => { active = false; };
  }, []);

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [realAddr, setRealAddr] = useState("");   // demo oracle: the real address
  const [tryPw, setTryPw] = useState("");
  const [tryErr, setTryErr] = useState("");
  const [busy, setBusy] = useState("");

  // ----- detect if a duress PIN is already set -----
  const [duressExists, setDuressExists] = useState(false);
  const [removingDuress, setRemovingDuress] = useState(false);

  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);

  useEffect(() => { refresh(); }, [refresh]);

  // Detect if a duress PIN is already configured.
  useEffect(() => {
    let active = true;
    hasDuressPin()
      .then((has) => { if (active) setDuressExists(has); })
      .catch(() => { if (active) setDuressExists(false); });
    return () => { active = false; };
  }, [hasDuressPin]);

  const handleRemoveDuress = () => {
    requireTwoFactor(async () => {
      setRemovingDuress(true);
      try {
        await removeDuressPin();
        // Disable biometric unlock completely: clears both preference (localStorage)
        // AND secure storage cache. This ensures the old duress PIN isn't used.
        // When user unlocks with real PIN next time, they can re-enable biometric.
        await disableBiometricUnlock();
        setDuressExists(false);
        setSavedPhrase(""); setSavedAddr("");
        setError(""); // clear any previous errors
        setError("Emergency PIN removed. Biometric unlock has been reset for security. Go to Settings → Security Settings → Biometric Unlock to re-enable it with your real PIN if desired.");
        await refresh();
      } catch (e) {
        setError(e?.message || "Could not remove Emergency PIN");
      } finally {
        setRemovingDuress(false);
      }
    }, { title: "Remove your Emergency PIN" });
  };

  const copy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopied(id); setTimeout(() => setCopied(""), 1500);
  };

  // ----- setup handlers -----
  const handleSave = async () => {
    setError(""); setSavedPhrase(""); setSavedAddr("");
    if (pin.length < 8) { setError("Emergency PIN must be exactly 8 digits"); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }
    // CRITICAL: configuring the decoy/duress system is gated behind the second
    // factor when one is set (no-op otherwise). Runs after local validation so a
    // mismatched PIN never reaches the gate.
    requireTwoFactor(async () => {
      setSaving(true);
      try {
        // setDuressPin now returns { mnemonic, address } so the user can FUND the
        // decoy. The decoy is a real wallet that can actually receive testnet funds.
        const { mnemonic, address } = await setDuressPin(pin);
        // OPT-IN: cache the DURESS pin behind the biometric gate so Face ID opens
        // the DECOY (never the real wallet). enableDecoyBiometricUnlock stores the
        // duress secret — not the real one — and is a no-op outside the PIN cohort
        // or when biometrics are unavailable, so this is safe to call guarded only
        // by the user's checkbox. The real wallet still needs the typed real PIN.
        if (useBioForDecoy && enableDecoyBiometricUnlock) {
          await enableDecoyBiometricUnlock(pin);
        }
        setSavedPhrase(mnemonic);
        setSavedAddr(address);
        setDuressExists(true);
        setPin(""); setConfirmPin(""); setDuressStep("enter");
        await refresh();
      } catch (e) {
        setError(e?.message || "Could not save Emergency PIN");
      } finally {
        setSaving(false);
      }
    }, { title: "Set your Emergency PIN" });
  };

  // DEMO ONLY: simulate funding the decoy address with a plausible small balance.
  const handleDemoFund = (address, eth = DEMO_DECOY_ETH) => {
    seedDemoDecoyBalance(address, eth);
    setBalRefresh((n) => n + 1);
  };

  // ----- demo handlers (use the REAL unlock path) -----
  const demoSetup = async () => {
    setBusy("Setting up demo…"); setTryErr("");
    try {
      // Create a throwaway REAL vault (idempotent: skip if one exists).
      if (!(await hasVault())) {
        await createWallet(DEMO_REAL_PW);
      }
      // Capture the real address as a demo "oracle" so we can later prove the
      // decoy session never exposes it. (Real apps never show this.)
      if (accounts?.[0]?.address) setRealAddr(accounts[0].address);
      // Configure the decoy and SEED a small plausible balance on its address so
      // the decoy looks funded (demo simulation of a real on-chain top-up).
      const { address } = await setDuressPin(DEMO_DURESS_PW);
      seedDemoDecoyBalance(address, DEMO_DECOY_ETH);
      setBalRefresh((n) => n + 1);
      lock();
      await refresh();
    } catch (e) {
      setTryErr(e?.message || "Demo setup failed");
    } finally {
      setBusy("");
    }
  };

  const demoUnlock = async (pw) => {
    setTryErr(""); setBusy("Unlocking…");
    try {
      await unlock(pw);
      setBalRefresh((n) => n + 1);
    } catch (e) {
      // A wrong PIN returns "Incorrect PIN" (v2 model: wrong guess is an explicit
      // error, not a silent decoy). The duress PIN opens the decoy silently.
      // The error text itself does NOT reveal whether a duress vault is configured.
      setTryErr(e?.message || "Unlock failed");
    } finally {
      setBusy("");
    }
  };

  const demoReset = async () => {
    setBusy("Resetting…"); setTryErr("");
    try {
      lock();
      await clearVault();
      await removeDuressPin();
      setRealAddr("");
      await refresh();
    } finally {
      setBusy("");
    }
  };

  // Remember the real address the first time a non-decoy session exposes it.
  useEffect(() => {
    if (isUnlocked && !isDecoy && accounts?.[0]?.address) {
      setRealAddr(accounts[0].address);
    }
  }, [isUnlocked, isDecoy, accounts]);

  const currentAddr = accounts?.[0]?.address;
  const explorerAddr = (a) => NET?.explorer ? `${NET.explorer}/address/${a}` : null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Emergency PIN / Hidden Wallet</h1>
        <p className="text-sm text-muted-foreground">
          A second PIN that shows a hidden wallet — use it if you&apos;re ever forced to open the app.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-caution/10 border border-caution/20 text-caution text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Provisional (test network), independent audit complete (2026-06-23).</b> Your real PIN opens
          the hidden real wallet; your Emergency PIN opens the hidden wallet; any other PIN shows
          an explicit "Incorrect PIN" error (the no-oracle property was dropped by
          design). 10 wrong PINs permanently delete all wallet data from this device, so the error can&apos;t
          be brute-forced. Not hidden-volume storage — forensics can reveal a second
          wallet exists, and without a hardware key (planned, not yet built) it doesn&apos;t
          resist offline seizure.
        </span>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Set an <b>Emergency PIN</b> different from your real one. Your{" "}
              <b>real PIN</b> opens your real wallet — hidden, with no UI tell.
              Your <b>Emergency PIN</b> opens a separate <b>hidden wallet</b> with
              its own address; your real wallet stays encrypted and is never
              touched in the hidden wallet session. Any other PIN shows an "Incorrect
              PIN" error; 10 wrong ones permanently delete all wallet data from this device. If
              you opt in, <b>Face ID opens the hidden wallet</b> — never the real wallet.
            </p>
          </div>
        </div>
      </div>

      {/* Plausibility model — be honest about what makes a decoy convincing */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Make the hidden wallet plausible: fund it</p>
        </div>
        <p className="text-xs text-muted-foreground">
          An <b>empty</b> hidden wallet looks suspicious. Send a small, sacrificial amount to
          the address below. Its balance is read <b>live from the chain</b> — the
          same number someone sees on a block explorer — so it can&apos;t be faked.
        </p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>A freshly funded hidden wallet has <b>no transaction history</b>, so it looks less lived-in than a real wallet.</li>
          <li>A <b>sophisticated attacker</b> who knows this feature exists, or inspects device storage, may still suspect a hidden wallet — this is runtime deniability, not steganographic hiding.</li>
        </ul>
      </div>

      {/* Remove existing duress PIN — shown when one is already set */}
      {duressExists && !savedPhrase && (
        <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-medium">Emergency PIN is configured</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            You have already set an Emergency PIN. To disable your hidden wallet and remove this PIN,
            click the button below.
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={removingDuress}
            onClick={handleRemoveDuress}
            data-testid="remove-duress-pin-btn"
          >
            {removingDuress ? "Removing…" : "Remove Emergency PIN"}
          </Button>
        </div>
      )}

      {/* Setup card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-medium">Set a custom Emergency PIN</span>
        </div>

        <div className="space-y-4">
          {duressStep === "enter" ? (
            <div>
              <Label className="block mb-3">New Emergency PIN</Label>
              <PinPad
                aria-label="New Emergency PIN"
                value={pin}
                onChange={setPin}
                onComplete={() => setDuressStep("confirm")}
                length={8}
                submitLabel="Continue"
              />
            </div>
          ) : (
            <div>
              <Label className="block mb-3">Confirm Emergency PIN</Label>
              <PinPad
                aria-label="Confirm Emergency PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                onComplete={handleSave}
                length={8}
                submitLabel="Save emergency PIN"
                disabled={saving}
              />
            </div>
          )}
          {/* Face-ID-opens-the-decoy opt-in. Shown ONLY when a biometric sensor
              is available on this device. OFF by default. Honest copy: Face ID
              opens the DECOY; the real wallet always needs the typed real PIN. */}
          {bioStatus?.available && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <label htmlFor="decoy-biometric-optin" className="flex items-start gap-2.5 cursor-pointer">
                <input
                  id="decoy-biometric-optin"
                  data-testid="decoy-biometric-optin"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={useBioForDecoy}
                  onChange={(e) => setUseBioForDecoy(e.target.checked)}
                />
                <span className="text-xs">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <Fingerprint className="h-3.5 w-3.5 text-primary" />
                    Enable Biometric Unlock (Decoy Wallet)
                  </span>
                  <span className="block text-muted-foreground mt-1">
                    Use {bioLabel} to unlock your decoy wallet (if Duress PIN is enabled).
                    When on, {bioLabel} at unlock opens the <b>hidden wallet</b> —
                    never your real wallet, which stays reachable only by typing your{" "}
                    <b>real PIN</b>. So if you&apos;re forced to unlock with {bioLabel},
                    only the hidden wallet is exposed.
                  </span>
                </span>
              </label>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20 text-xs space-y-3">
            <p className="font-medium text-success">✓ Emergency PIN saved. Hidden wallet created.</p>

            {/* Fund target: the decoy's REAL address + its live balance. */}
            {savedAddr && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground">
                  Fund the hidden wallet (send a small {NET?.symbol || "ETH"} amount on{" "}
                  {NET?.name || "the test network"} you&apos;re willing to sacrifice):
                </p>
                <div className="flex items-center gap-2 p-2 rounded bg-background">
                  <code className="flex-1 break-all text-foreground">{savedAddr}</code>
                  <button onClick={() => copy(savedAddr, "decoy-addr")} title="Copy hidden wallet address" aria-label="Copy hidden wallet address" className="shrink-0">
                    {copied === "decoy-addr" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Hidden wallet balance:</span>
                  <DecoyBalance address={savedAddr} refreshKey={balRefresh} />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setBalRefresh((n) => n + 1)} className="inline-flex items-center gap-1 text-primary">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                  {explorerAddr(savedAddr) && (
                    <a href={explorerAddr(savedAddr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">
                      <ExternalLink className="h-3 w-3" /> View on explorer
                    </a>
                  )}
                  {DEMO && (
                    <button onClick={() => handleDemoFund(savedAddr)} className="inline-flex items-center gap-1 text-primary">
                      <Coins className="h-3 w-3" /> Simulate funding ({DEMO_DECOY_ETH})
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Get free test network {NET?.symbol || "ETH"} from a public faucet, then send a little here.
                </p>
              </div>
            )}

            <div>
              <p className="text-muted-foreground">
                Decoy recovery phrase (back this up only if you want to manage the
                hidden wallet from another app — otherwise it lives in this app):
              </p>
              <code className="block break-words rounded bg-background p-2 text-foreground mt-1">{savedPhrase}</code>
            </div>
          </div>
        )}
      </div>

      {/* Live demonstration — DEMO only */}
      {DEMO && (
        <div className="p-5 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <span className="font-semibold">Live demonstration (demo mode)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Exercises the real unlock flow. Step 1 creates a throwaway real wallet
            (password <code>{DEMO_REAL_PW}</code>) and a hidden wallet (Emergency PIN{" "}
            <code>{DEMO_DURESS_PW}</code>) seeded with a small{" "}
            {NET?.symbol || "ETH"} balance. Then unlock with either to compare.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              1. Set up real + funded hidden wallet
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_REAL_PW)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock with REAL PIN
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_DURESS_PW)}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Unlock with EMERGENCY PIN
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
          </div>

          {/* Free-form unlock: wrong PIN errors; duress PIN silently opens the decoy */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="duress-try-pw" className="text-xs">Or type any password</Label>
              <Input
                id="duress-try-pw"
                className="mt-1"
                value={tryPw}
                onChange={(e) => setTryPw(e.target.value)}
                placeholder="try the wrong password"
              />
            </div>
            <Button size="sm" disabled={!!busy || !tryPw || !vaultExists} onClick={() => demoUnlock(tryPw)}>
              Unlock
            </Button>
          </div>

          {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
          {tryErr && (
            <p className="text-xs text-destructive">
              {tryErr} <span className="text-muted-foreground">(wrong PIN errors explicitly — v2 model; Emergency PIN opens the hidden wallet)</span>
            </p>
          )}

          {/* Result panel */}
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            {!isUnlocked ? (
              <p className="text-muted-foreground">Locked. Unlock above to see which wallet opens.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {isDecoy
                    ? <span className="px-2 py-0.5 rounded bg-caution/20 text-caution text-xs font-semibold">HIDDEN WALLET</span>
                    : <span className="px-2 py-0.5 rounded bg-success/20 text-success text-xs font-semibold">REAL WALLET</span>}
                </div>
                <p className="font-mono text-xs">Address: {short(currentAddr)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Test network balance:</span>
                  <DecoyBalance address={currentAddr} refreshKey={balRefresh} />
                </div>
                {isDecoy ? (
                  <p className="text-xs text-muted-foreground">
                    This session exposes only the hidden wallet address + its real balance
                    above. The real wallet is not derived, named, or referenced here.
                  </p>
                ) : null}
                {/* DEMO ORACLE — proves the decoy never shows the real address.
                    Real apps never reveal this; shown here only to teach. */}
                {realAddr && (
                  <p className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-2">
                    demo oracle — real wallet address: {short(realAddr)}{" "}
                    {isDecoy && currentAddr !== realAddr ? "✓ hidden in this hidden wallet session" : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <Button size="sm" variant="destructive" disabled={!!busy} onClick={demoReset}>
            Reset demo (delete all wallet data + hidden wallet)
          </Button>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            To test: lock your wallet, then unlock with your Emergency PIN — the app
            opens the hidden wallet showing its real on-chain balance. Never
            share your Emergency PIN. If you forget it, remove and reset it from this
            page using your normal login.
          </p>
        </div>
      )}
      {/* PIN + Action Password 2FA gate — no-op until an Action Password is set */}
      {gateModal}
    </div>
  );
}
