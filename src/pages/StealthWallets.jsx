// pages/StealthWallets.jsx
//
// STEALTH / HIDDEN WALLETS  (S3 — Direction-C individual security).  PROVISIONAL.
//
// Lets the user create one or more HIDDEN wallets that never appear in the normal
// wallet UI and are revealed ONLY by typing their dedicated secret at the SAME
// unlock prompt every other wallet uses. Plausible deniability for extra wallets:
// a coercer who unlocks the visible wallet sees no sign a hidden one exists.
//
// This page routes reveals through the EXISTING unlock flow (useWallet().unlock)
// and the existing keystore/crypto. A hidden wallet is a real, independently-
// encrypted vault stored among indistinguishable chaff slots; see
// src/wallet-core/stealth.js for the design and its honest limitations.
//
// A DELIBERATE PROPERTY: this page CANNOT list your existing hidden wallets. By
// design the app keeps no enumerable index of them (an index readable with your
// main password would let a coercer enumerate them). You create a hidden wallet
// here and remember its secret; that same indistinguishability is what hides it.
//
// DEMO vs NATIVE:
//   - The "Create a hidden wallet" card works everywhere (real, hidden vault).
//   - Balances are real on-chain reads in real/native builds and clearly-labelled
//     seeded values in demo (a fresh address can't hold live funds on a simulator).
//   - The "Live demonstration" card is DEMO-gated: it stands up a throwaway real
//     wallet + a hidden wallet, then exercises the REAL unlock path to prove the
//     hidden wallet is invisible under the real session and revealed only by its
//     secret — demonstrable on the simulator.

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import {
  resolveDecoyBalance, seedDemoDecoyBalance, DECOY_NETWORK_KEY,
} from "@/lib/decoyBalance";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import {
  EyeOff, Eye, Shield, CheckCircle2, AlertTriangle, Lock, Unlock, FlaskConical,
  Copy, Check, RefreshCw, Coins, ExternalLink, Ghost,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "main-pass-2468";
const DEMO_HIDDEN_SECRET = "hidden-key-9753";
// A small, plausible hidden-wallet balance to seed in the demo (ETH).
const DEMO_HIDDEN_ETH = "0.0231";

const NET = getNetworkInfo(DECOY_NETWORK_KEY);

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

// Reads and shows an address's native testnet balance. REAL on-chain read in
// real/native builds; SEEDED (clearly labelled) in demo. Never a hardcoded value.
// Reuses the decoy-balance resolver — it is a generic per-address balance read.
function LiveBalance({ address, refreshKey }) {
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

export default function StealthWallets() {
  const wallet = useWallet();
  const {
    isUnlocked, isHidden, isDecoy, accounts,
    hasVault, addHiddenWallet, initStealthPool, removeAllHiddenWallets,
    createWallet, unlock, lock, clearVault,
  } = wallet;

  // ----- create card state -----
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPhrase, setSavedPhrase] = useState("");  // hidden mnemonic (once)
  const [savedAddr, setSavedAddr] = useState("");       // hidden address (to fund)
  const [copied, setCopied] = useState("");
  const [balRefresh, setBalRefresh] = useState(0);

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [realAddr, setRealAddr] = useState("");   // demo oracle: the real address
  const [hiddenAddr, setHiddenAddr] = useState(""); // demo oracle: the hidden one
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

  // ----- create handler -----
  const handleCreate = async () => {
    setError(""); setSavedPhrase(""); setSavedAddr("");
    if (secret.length < 4) { setError("Reveal secret must be at least 4 characters"); return; }
    if (secret !== confirm) { setError("Secrets do not match"); return; }
    setSaving(true);
    try {
      const { mnemonic, address } = await addHiddenWallet(secret);
      setSavedPhrase(mnemonic);
      setSavedAddr(address);
      setSecret(""); setConfirm("");
      await refresh();
    } catch (e) {
      setError(e?.message || "Could not create hidden wallet");
    } finally {
      setSaving(false);
    }
  };

  // DEMO ONLY: simulate funding the hidden address with a plausible small balance.
  const handleDemoFund = (address, eth = DEMO_HIDDEN_ETH) => {
    seedDemoDecoyBalance(address, eth);
    setBalRefresh((n) => n + 1);
  };

  // ----- demo handlers (use the REAL unlock path) -----
  const demoSetup = async () => {
    setBusy("Setting up demo…"); setTryErr("");
    try {
      // Create a throwaway REAL (visible) vault (idempotent: skip if one exists).
      if (!(await hasVault())) {
        await createWallet(DEMO_REAL_PW);
      }
      // Capture the visible wallet's address as a demo "oracle" so we can later
      // prove the hidden session never exposes it. (Real apps never show this.)
      if (accounts?.[0]?.address) setRealAddr(accounts[0].address);
      await initStealthPool();
      // Create the hidden wallet and SEED a small plausible balance on its address.
      const { address } = await addHiddenWallet(DEMO_HIDDEN_SECRET);
      setHiddenAddr(address);
      seedDemoDecoyBalance(address, DEMO_HIDDEN_ETH);
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
      // SAME generic error whether or not a hidden wallet exists — no tell.
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
      await removeAllHiddenWallets();
      setRealAddr(""); setHiddenAddr("");
      await refresh();
    } finally {
      setBusy("");
    }
  };

  // Remember the visible address the first time a normal session exposes it.
  useEffect(() => {
    if (isUnlocked && !isHidden && !isDecoy && accounts?.[0]?.address) {
      setRealAddr(accounts[0].address);
    }
  }, [isUnlocked, isHidden, isDecoy, accounts]);

  const currentAddr = accounts?.[0]?.address;
  const explorerAddr = (a) => NET?.explorer ? `${NET.explorer}/address/${a}` : null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Ghost className="h-5 w-5 text-primary" /> Stealth / Hidden Wallets
        </h1>
        <p className="text-sm text-muted-foreground">
          Wallets that never appear in the app and are revealed only by a secret.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Provisional (testnet).</b> Provides runtime + count deniability
          (identical UI, errors, and timing at unlock; the number of hidden wallets
          is not revealed). It is not hidden-volume storage: a forensic inspection
          can see a fixed pool of vault-shaped slots exists, but cannot tell which —
          or how many — are real wallets versus random chaff.
        </span>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a hidden wallet with its own <b>reveal secret</b> (different
              from your main password and any duress PIN). It will <b>not</b> appear
              anywhere in the app — no list, no count, no indicator. To open it,
              type its secret at the <b>normal unlock screen</b>; the app opens that
              hidden wallet instead of your visible one. To anyone inspecting the
              unlocked app there is no sign a hidden wallet exists.
            </p>
          </div>
        </div>
      </div>

      {/* Deniability model — be honest */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">What this protects — and what it does not</p>
        </div>
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>Hidden wallets are stored among a fixed pool of identical, vault-shaped slots — some real, the rest random <b>chaff</b>. Without the secret, real and chaff are indistinguishable, so the <b>count</b> of hidden wallets is not revealed.</li>
          <li>The pool is seeded for <b>every</b> wallet on the device, so its presence means "this device has a Veyrnox wallet" — not "this device has hidden wallets".</li>
          <li>This is <b>not</b> a hidden volume. A forensic examiner comparing against a pristine install can see the pool itself exists; they just cannot learn how many slots (if any) are real or what they hold.</li>
          <li>We keep <b>no list</b> of your hidden wallets — by design. A forgotten secret means that hidden wallet is unrecoverable from this app. Remember each secret.</li>
          <li>Provisional, testnet-only, pending independent audit.</li>
        </ul>
      </div>

      {/* Create card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Ghost className="h-5 w-5 text-primary" />
          <span className="font-medium">Create a hidden wallet</span>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Reveal secret</Label>
            <div className="relative mt-1.5">
              <Input
                type={showSecret ? "text" : "password"}
                maxLength={64}
                placeholder="At least 4 characters — different from your main password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="pr-10 tracking-widest text-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowSecret((s) => !s)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirm reveal secret</Label>
            <Input
              type={showSecret ? "text" : "password"}
              maxLength={64}
              placeholder="Re-enter secret"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 tracking-widest text-lg"
            />
          </div>
          <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-600 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              The secret must be <b>different</b> from your main password and any
              duress PIN. If it matches one of those, that wallet opens first and
              the hidden one never will. We can't check this for you — your main
              password is never held in the clear.
            </span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!secret || !confirm || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create hidden wallet"}
          </Button>
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs space-y-3">
            <p className="font-medium text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Hidden wallet created. It is invisible until you unlock with its secret.
            </p>

            {savedAddr && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground">
                  Fund it (send a small {NET?.symbol || "ETH"} amount on{" "}
                  {NET?.name || "the testnet"}):
                </p>
                <div className="flex items-center gap-2 p-2 rounded bg-background">
                  <code className="flex-1 break-all text-foreground">{savedAddr}</code>
                  <button onClick={() => copy(savedAddr, "hidden-addr")} title="Copy hidden address" className="shrink-0">
                    {copied === "hidden-addr" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Hidden balance:</span>
                  <LiveBalance address={savedAddr} refreshKey={balRefresh} />
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
                      <Coins className="h-3 w-3" /> Simulate funding ({DEMO_HIDDEN_ETH})
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="text-muted-foreground">
                Hidden wallet recovery phrase (back this up — there is no other copy,
                and the app keeps no list of hidden wallets to recover from):
              </p>
              <code className="block break-words rounded bg-background p-2 text-foreground mt-1">{savedPhrase}</code>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Remember your reveal secret. To open this wallet later, just enter that
              secret at the normal unlock screen.
            </p>
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
            Exercises the real unlock flow. Step 1 creates a throwaway visible wallet
            (password <code>{DEMO_REAL_PW}</code>) and a hidden wallet (reveal secret{" "}
            <code>{DEMO_HIDDEN_SECRET}</code>) seeded with a small{" "}
            {NET?.symbol || "ETH"} balance. Then unlock with either to compare — and
            note the visible session shows <b>no</b> sign the hidden wallet exists.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              1. Set up visible + hidden wallet
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_REAL_PW)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock VISIBLE
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_HIDDEN_SECRET)}>
              <Ghost className="h-3.5 w-3.5 mr-1" /> Reveal HIDDEN (secret)
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            )}
          </div>

          {/* Free-form unlock to prove a wrong secret fails identically */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Or type any password / secret</Label>
              <Input
                className="mt-1"
                value={tryPw}
                onChange={(e) => setTryPw(e.target.value)}
                placeholder="try a wrong secret"
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
                  {isHidden
                    ? <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-500 text-xs font-semibold">HIDDEN WALLET</span>
                    : <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 text-xs font-semibold">VISIBLE WALLET</span>}
                </div>
                <p className="font-mono text-xs">Address: {short(currentAddr)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Testnet balance:</span>
                  <LiveBalance address={currentAddr} refreshKey={balRefresh} />
                </div>
                {!isHidden ? (
                  <p className="text-xs text-muted-foreground">
                    This is the visible wallet a coercer would see. Nothing here lists,
                    counts, or hints at the hidden wallet — it is not derived or
                    referenced in this session.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Revealed via its secret. This session exposes only the hidden
                    address + its real balance. The visible wallet is not referenced.
                  </p>
                )}
                {/* DEMO ORACLE — proves the visible session never shows the hidden
                    address (and vice versa). Real apps never reveal this. */}
                {(realAddr || hiddenAddr) && (
                  <div className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-2 space-y-0.5">
                    {realAddr && <p>demo oracle — visible address: {short(realAddr)}</p>}
                    {hiddenAddr && (
                      <p>
                        demo oracle — hidden address: {short(hiddenAddr)}{" "}
                        {!isHidden && currentAddr === realAddr && currentAddr !== hiddenAddr
                          ? "✓ absent from this visible session"
                          : isHidden && currentAddr === hiddenAddr
                            ? "✓ this is the revealed hidden wallet"
                            : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button size="sm" variant="destructive" disabled={!!busy} onClick={demoReset}>
            Reset demo (wipe vault + hidden wallets)
          </Button>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            To open a hidden wallet: lock your wallet, then unlock with that wallet's
            reveal secret — the app opens it showing its real on-chain balance. ⚠️
            Never share a reveal secret, and remember it: there is no list of hidden
            wallets and no reset.
          </p>
        </div>
      )}
    </div>
  );
}
