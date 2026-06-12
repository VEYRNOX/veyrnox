// pages/DuressPin.jsx
//
// DURESS PIN / DECOY WALLET  (S3 — individual security).  PROVISIONAL.
//
// Lets the user configure a SECONDARY "duress" password. Entered at the normal
// unlock prompt, it opens a DECOY wallet (a real, separate vault) instead of the
// real one — plausible deniability under coercion.
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
import { DEMO } from "@/api/demoClient";
import {
  resolveDecoyBalance, seedDemoDecoyBalance, DECOY_NETWORK_KEY,
} from "@/lib/decoyBalance";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import {
  Shield, Eye, EyeOff, AlertTriangle, Lock, Unlock, FlaskConical,
  Copy, Check, RefreshCw, Coins, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [state, setState] = useState({ loading: true });
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
    hasVault, setDuressPin, removeDuressPin,
    createWallet, unlock, lock, clearVault,
  } = wallet;

  // ----- setup card state -----
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPhrase, setSavedPhrase] = useState("");   // decoy mnemonic (shown once)
  const [savedAddr, setSavedAddr] = useState("");       // decoy address (to fund)
  const [copied, setCopied] = useState("");
  const [balRefresh, setBalRefresh] = useState(0);      // bump to re-read balances

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [realAddr, setRealAddr] = useState("");   // demo oracle: the real address
  const [tryPw, setTryPw] = useState("");
  const [tryErr, setTryErr] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);

  useEffect(() => { refresh(); }, [refresh]);

  const copy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopied(id); setTimeout(() => setCopied(""), 1500);
  };

  // ----- setup handlers -----
  const handleSave = async () => {
    setError(""); setSavedPhrase(""); setSavedAddr("");
    if (pin.length < 4) { setError("Duress PIN must be at least 4 characters"); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }
    setSaving(true);
    try {
      // setDuressPin now returns { mnemonic, address } so the user can FUND the
      // decoy. The decoy is a real wallet that can actually receive testnet funds.
      const { mnemonic, address } = await setDuressPin(pin);
      setSavedPhrase(mnemonic);
      setSavedAddr(address);
      setPin(""); setConfirmPin("");
      await refresh();
    } catch (e) {
      setError(e?.message || "Could not save duress PIN");
    } finally {
      setSaving(false);
    }
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
      // SAME generic error whether or not a duress vault exists — no tell.
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
        <h1 className="text-xl font-bold">Duress PIN / Decoy Wallet</h1>
        <p className="text-sm text-muted-foreground">
          A secondary password that opens a decoy wallet under coercion.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Provisional (testnet), pending independent audit.</b> This is runtime
          deniability only (identical UI, errors, and timing at unlock) — not
          hidden-volume storage: a forensic inspection of device storage can reveal
          a second vault exists.
        </span>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Set a <b>duress PIN</b> different from your real one. Entered at the
              normal unlock screen, it opens a separate <b>decoy wallet</b> with its
              own address; your real wallet stays encrypted and is never referenced
              in the decoy session — to an observer there's no sign it exists.
            </p>
          </div>
        </div>
      </div>

      {/* Plausibility model — be honest about what makes a decoy convincing */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Make the decoy plausible: fund it</p>
        </div>
        <p className="text-xs text-muted-foreground">
          An <b>empty</b> decoy is suspicious. Send a small amount you're willing to
          sacrifice to the decoy address below. Its balance is read{" "}
          <b>live from the chain</b> — the same number a coercer sees on a block
          explorer — so it can't be faked.
        </p>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>Honest limit: a freshly funded decoy has <b>no transaction history</b>, so it looks less "lived-in" than a wallet used over time.</li>
          <li>A <b>sophisticated coercer</b> who knows this feature exists, or inspects device storage, may still suspect a hidden wallet — this is runtime deniability, not steganographic hiding.</li>
        </ul>
      </div>

      {/* Setup card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-medium">Set a custom duress PIN</span>
        </div>

        <div className="space-y-4">
          <div>
            <Label>New Duress PIN</Label>
            <div className="relative mt-1.5">
              <Input
                type={showPin ? "text" : "password"}
                maxLength={64}
                placeholder="At least 4 characters — different from your real PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="pr-10 tracking-widest text-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPin((s) => !s)}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirm Duress PIN</Label>
            <Input
              type={showPin ? "text" : "password"}
              maxLength={64}
              placeholder="Re-enter PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="mt-1.5 tracking-widest text-lg"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Set / Change duress PIN"}
          </Button>
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs space-y-3">
            <p className="font-medium text-green-600">✓ Duress PIN saved. Decoy wallet created.</p>

            {/* Fund target: the decoy's REAL address + its live balance. */}
            {savedAddr && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground">
                  Fund the decoy (send a small {NET?.symbol || "ETH"} amount on{" "}
                  {NET?.name || "the testnet"} you're willing to sacrifice):
                </p>
                <div className="flex items-center gap-2 p-2 rounded bg-background">
                  <code className="flex-1 break-all text-foreground">{savedAddr}</code>
                  <button onClick={() => copy(savedAddr, "decoy-addr")} title="Copy decoy address" className="shrink-0">
                    {copied === "decoy-addr" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Decoy balance:</span>
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
                  Get free testnet {NET?.symbol || "ETH"} from a public faucet, then send a little here.
                </p>
              </div>
            )}

            <div>
              <p className="text-muted-foreground">
                Decoy recovery phrase (back this up only if you want to manage the
                decoy from another wallet — otherwise it lives in this app):
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
            (password <code>{DEMO_REAL_PW}</code>) and a decoy (duress password{" "}
            <code>{DEMO_DURESS_PW}</code>) seeded with a small{" "}
            {NET?.symbol || "ETH"} balance. Then unlock with either to compare.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              1. Set up real + funded decoy
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_REAL_PW)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock with REAL PIN
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_DURESS_PW)}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Unlock with DURESS PIN
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
          </div>

          {/* Free-form unlock to prove a wrong PIN fails identically */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Or type any password</Label>
              <Input
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
              {tryErr} <span className="text-muted-foreground">(same error for any non-matching password — no tell)</span>
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
                    ? <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-600 text-xs font-semibold">DECOY WALLET</span>
                    : <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 text-xs font-semibold">REAL WALLET</span>}
                </div>
                <p className="font-mono text-xs">Address: {short(currentAddr)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Testnet balance:</span>
                  <DecoyBalance address={currentAddr} refreshKey={balRefresh} />
                </div>
                {isDecoy ? (
                  <p className="text-xs text-muted-foreground">
                    This session exposes only the decoy address + its real balance
                    above. The real wallet is not derived, named, or referenced here.
                  </p>
                ) : null}
                {/* DEMO ORACLE — proves the decoy never shows the real address.
                    Real apps never reveal this; shown here only to teach. */}
                {realAddr && (
                  <p className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-2">
                    demo oracle — real wallet address: {short(realAddr)}{" "}
                    {isDecoy && currentAddr !== realAddr ? "✓ hidden in this decoy session" : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          <Button size="sm" variant="destructive" disabled={!!busy} onClick={demoReset}>
            Reset demo (wipe vault + decoy)
          </Button>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            To test: lock your wallet, then unlock with your duress PIN — the app
            opens the decoy wallet showing its real on-chain balance. ⚠️ Never
            share your Duress PIN. If you forget it, remove and reset it from this
            page using your normal login.
          </p>
        </div>
      )}
    </div>
  );
}
