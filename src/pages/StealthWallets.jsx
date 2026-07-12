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
// MULTI-CHAIN IDENTITY (this change): a hidden wallet is a real BIP-39 wallet, so
// it has the SAME EVM + BTC + SOL identity any wallet does. Its non-EVM addresses
// come from the EXISTING derivation (deriveBtcAddress/deriveSolAddress — the same
// paths WalletProvider.deriveBtc/deriveSol use for the primary wallet); on reveal
// the provider already populates btcAccount/solAccount, so a revealed hidden
// wallet shows all three. Balances are PRIVACY-AWARE and OPT-IN: see lib/
// hiddenBalance.js — a balance check contacts a public node (phone-home), so we
// never fire it automatically; the user taps "Check balances" and is told so.
//
// HONEST LIMIT kept visible in-UI: stealth hides a wallet IN THE APP, not
// ON-CHAIN. Every EVM/BTC/SOL address here is public — anyone who knows it can
// see its balance/history on an explorer.
//
// DEMO vs NATIVE:
//   - The "Create a hidden wallet" card works everywhere (real, hidden vault).
//   - Balances are real on-chain reads in real/native and clearly-labelled seeded
//     values in demo (a fresh address can't hold live funds on a simulator).
//   - The "Live demonstration" card is DEMO-gated: it stands up a throwaway real
//     wallet + a hidden wallet, then exercises the REAL unlock path to prove the
//     hidden wallet is invisible under the real session and revealed only by its
//     secret — now showing its full multi-chain identity.

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/WalletProvider";
import { useActionGuard } from "@/components/security/useActionGuard";
import { DEMO } from "@/api/demoClient";
import { base44 } from "@/api/base44Client";
import {
  HIDDEN_CHAINS, resolveHiddenBalance, seedDemoHiddenBalance,
} from "@/lib/hiddenBalance";
import { deriveAddressFromMnemonic } from "@/hooks/useDeriveAddress";
import {
  EyeOff, Eye, Shield, CheckCircle2, AlertTriangle, Lock, Unlock, FlaskConical,
  Copy, Check, Coins, ExternalLink, Ghost, Globe, Wifi,
  FolderInput, ShieldAlert, Wallet as WalletIcon, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "main-pass-2468";
const DEMO_HIDDEN_SECRET = "hidden-key-9753";
// Small, plausible per-chain balances to seed in the demo.
const DEMO_AMOUNTS = { evm: "0.0231", btc: "0.0007", sol: "0.42" };

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

// Renders a hidden wallet's EVM + BTC + SOL addresses with copy + explorer links,
// and an OPT-IN balance check. Balances are NOT fetched until the user asks (each
// check is a phone-home to a public node — see lib/hiddenBalance.js). `addresses`
// is a { evm, btc, sol } map of address strings.
function MultiChainIdentity({ addresses, copy, copied, idPrefix }) {
  const [balances, setBalances] = useState(null); // null = not checked yet
  const [checking, setChecking] = useState(false);

  const rows = HIDDEN_CHAINS
    .map((c) => ({ c, address: addresses?.[c.key] }))
    .filter((r) => r.address);

  // Re-checking after a demo "simulate funding" should re-read; reset on address change.
  useEffect(() => { setBalances(null); }, [addresses?.evm, addresses?.btc, addresses?.sol]);

  // Plain handler (not memoized): runs ONLY on an explicit user action, so each
  // call is a deliberate phone-home. See lib/hiddenBalance.js on the opt-in posture.
  const check = async () => {
    setChecking(true);
    try {
      const out = {};
      for (const { c, address } of rows) {
        try { out[c.key] = await resolveHiddenBalance(c.key, address); }
        catch (e) { out[c.key] = { error: e?.message || "read failed" }; }
      }
      setBalances(out);
    } finally {
      setChecking(false);
    }
  };

  const demoFundAll = () => {
    rows.forEach(({ c, address }) => seedDemoHiddenBalance(c.key, address, DEMO_AMOUNTS[c.key]));
    // re-read so the seeded values show immediately
    check();
  };

  return (
    <div className="space-y-2.5">
      {rows.map(({ c, address }) => {
        const b = balances?.[c.key];
        return (
          <div key={c.key} className="rounded-lg bg-background p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">{c.label}</span>
              <span className="text-[10px] text-muted-foreground">{c.networkName()}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-[11px] text-foreground">{address}</code>
              <button onClick={() => copy(address, `${idPrefix}-${c.key}`)} title={`Copy ${c.label} address`} aria-label={`Copy ${c.label} address`} className="shrink-0">
                {copied === `${idPrefix}-${c.key}` ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {c.explorer(address) && (
                <a href={c.explorer(address)} target="_blank" rel="noreferrer" title="View on explorer" aria-label={`View ${c.label} address on explorer`} className="shrink-0">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-semibold">
                {!balances ? (
                  <span className="text-muted-foreground">— not checked</span>
                ) : b?.error ? (
                  <span className="text-muted-foreground" title={b.error}>unavailable</span>
                ) : (
                  <>
                    {Number(b.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} {b.unit}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      {b.source === "chain" ? "(live on-chain)" : "(demo — simulated)"}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        <button onClick={check} disabled={checking} className="inline-flex items-center gap-1 text-primary text-[11px]">
          <Wifi className="h-3 w-3" /> {checking ? "Checking…" : balances ? "Re-check balances" : "Check balances"}
        </button>
        {DEMO && (
          <button onClick={demoFundAll} className="inline-flex items-center gap-1 text-primary text-[11px]">
            <Coins className="h-3 w-3" /> Simulate funding (demo)
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
        <Globe className="h-3 w-3 mt-0.5 shrink-0" />
        Checking a balance contacts that chain's public node — it reveals your address. So it's opt-in and never automatic.
      </p>
    </div>
  );
}

// DEMO walkthrough constants for the move-existing flow. The mnemonic is the
// canonical BIP-39 all-"abandon" PUBLIC test vector (no funds) so the demo can
// derive a real, matching address and run the move end-to-end on the simulator.
const DEMO_MOVE_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DEMO_MOVE_SECRET = "move-secret-8642";
const DEMO_MOVE_LABEL = "Spare ETH (movable demo)";

// MOVE AN EXISTING (previously-VISIBLE) WALLET INTO HIDDEN. The riskier variant:
// it reuses the same hidden pool + crypto, but because the wallet was on screen
// before, hiding it creates a transition tell. The UI makes the user acknowledge
// that before proceeding, then (only after the wallet is safely hidden + verified)
// purges its visible record so no leftover label/address/balance remains in-app.
function MoveExistingWallet() {
  const { moveWalletToHidden, peekHiddenWallet } = useWallet();
  const { requireTwoFactor, gateModal } = useActionGuard();
  const qc = useQueryClient();
  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });
  // Only EVM wallets (0x…) can be address-matched against a recovery phrase, so we
  // can prove the user controls the wallet they're hiding. Others aren't offered.
  const evmWallets = wallets.filter((w) => (w.address || "").startsWith("0x"));

  const [selId, setSelId] = useState("");
  const [phrase, setPhrase] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);     // { name, address }
  const [peek, setPeek] = useState(null);      // reveal-verification result
  const [verifySecret, setVerifySecret] = useState("");

  const selected = evmWallets.find((w) => w.id === selId) || null;

  const reset = () => {
    setSelId(""); setPhrase(""); setSecret(""); setConfirm(""); setError("");
  };

  const handleMove = async () => {
    setError(""); setPeek(null);
    if (!selected) { setError("Select a wallet to hide."); return; }
    const m = phrase.trim().replace(/\s+/g, " ");
    if (secret.length < 4) { setError("Reveal secret must be at least 4 characters."); return; }
    if (secret !== confirm) { setError("Secrets do not match."); return; }
    // Address-match: you can only hide a wallet you actually hold the keys to (and
    // you're hiding the one you selected, not a different wallet).
    let derived;
    try { derived = deriveAddressFromMnemonic(m, 0).address; }
    catch { setError("Enter the valid recovery phrase for this wallet."); return; }
    if (derived.toLowerCase() !== (selected.address || "").toLowerCase()) {
      setError("That recovery phrase does not derive this wallet's address. You can only hide a wallet you control.");
      return;
    }
    // CRITICAL: hiding a previously-visible wallet (irreversibly purges its visible
    // record) is gated behind the second factor when one is set (no-op otherwise).
    requireTwoFactor(async () => {
      setBusy(true);
      try {
        // 1) Store + SELF-VERIFY in the hidden pool. moveWalletToHidden throws if the
        //    wallet isn't revealable afterwards, so we never delete a still-visible
        //    record for a wallet that didn't actually get hidden.
        await moveWalletToHidden(m, secret);
        // 2) ONLY NOW purge the visible record + caches so no residual tell remains.
        await base44.entities.Wallet.delete(selected.id);
        qc.invalidateQueries({ queryKey: ["wallets"] });
        qc.invalidateQueries({ queryKey: ["hd-wallets"] });
        setDone({ name: selected.name, address: selected.address });
        reset();
      } catch (e) {
        setError(e?.message || "Could not hide the wallet.");
      } finally {
        setBusy(false);
      }
    }, { title: "Hide this wallet" });
  };

  const verifyReveal = async (sec) => {
    setPeek({ loading: true });
    try { const r = await peekHiddenWallet(sec); setPeek({ loading: false, address: r?.address || null }); }
    catch { setPeek({ loading: false, address: null }); }
  };

  // DEMO: stand up a movable wallet whose address matches DEMO_MOVE_MNEMONIC and
  // prefill the form, so the walkthrough is one-click on the simulator.
  const demoSetup = async () => {
    setBusy(true); setError(""); setDone(null); setPeek(null);
    try {
      const address = deriveAddressFromMnemonic(DEMO_MOVE_MNEMONIC, 0).address;
      const list = await base44.entities.Wallet.list();
      let w = list.find((x) => (x.address || "").toLowerCase() === address.toLowerCase());
      if (!w) {
        w = await base44.entities.Wallet.create({ name: DEMO_MOVE_LABEL, currency: "ETH", address, balance: 0.0177 });
        seedDemoHiddenBalance("evm", address, "0.0177");
        qc.invalidateQueries({ queryKey: ["wallets"] });
      }
      setSelId(w?.id || ""); setPhrase(DEMO_MOVE_MNEMONIC);
      setSecret(DEMO_MOVE_SECRET); setConfirm(DEMO_MOVE_SECRET);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <FolderInput className="h-5 w-5 text-primary" />
        <span className="font-medium">Move an existing wallet into hidden</span>
      </div>

      {/* TRANSITION-TELL WARNING — must be shown before hiding a visible wallet. */}
      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] text-destructive space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Weaker than a fresh hidden wallet — read this
        </div>
        <p>This wallet is already visible — anyone who saw it before can notice it's gone and demand it back. A new hidden wallet they never knew about is safer.</p>
      </div>

      {/* Live visible-wallet list — so the disappearance after a move is visible.
          DENIABILITY (CLAUDE.md "never show wallet count/list"): the heading must
          NOT interpolate the visible-wallet count — that publishes the active-
          context cardinality. The selectable list below is functionally required
          (the user picks which wallet to hide), but the count is not. */}
      <div className="text-[11px] text-muted-foreground">
        Choose a visible wallet to move into hidden:
      </div>
      <div className="space-y-1.5">
        {evmWallets.length === 0 && (
          <p className="text-xs text-muted-foreground">No EVM wallets to hide.</p>
        )}
        {evmWallets.map((w) => (
          <label key={w.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selId === w.id ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name="move-wallet" checked={selId === w.id} onChange={() => setSelId(w.id)} />
            <WalletIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="text-xs font-semibold">{w.name || "Wallet"}</span>
              <span className="block font-mono text-[10px] text-muted-foreground truncate">{w.address}</span>
            </span>
          </label>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Recovery phrase for “{selected.name}”</Label>
            <textarea
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              rows={2}
              placeholder="The 12/24-word phrase for this wallet (proves you control it)"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              The app holds only public data, so you supply the phrase to move the
              real wallet into hidden. It's encrypted with your reveal secret, never
              stored in the clear.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Reveal secret</Label>
              <Input type="password" className="mt-1" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="≥ 4 chars" />
            </div>
            <div>
              <Label className="text-xs">Confirm</Label>
              <Input type="password" className="mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="re-enter" />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button variant="destructive" className="w-full gap-1.5" disabled={busy} onClick={handleMove}>
            <FolderInput className="h-4 w-4" /> {busy ? "Hiding…" : "Hide this wallet"}
          </Button>
        </div>
      )}

      {!selected && error && <p className="text-xs text-destructive">{error}</p>}

      {DEMO && (
        <div className="pt-1 border-t border-border">
          <Button size="sm" variant="secondary" className="mt-3 gap-1.5" disabled={busy} onClick={demoSetup}>
            <FlaskConical className="h-3.5 w-3.5" /> Demo: add a movable wallet + prefill
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Adds a visible “{DEMO_MOVE_LABEL}” wallet and fills the phrase + secret
            (<code>{DEMO_MOVE_SECRET}</code>) so you can run the move, watch it vanish
            from the list above, then verify it reveals only with its secret.
          </p>
        </div>
      )}

      {done && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-xs space-y-2">
          <p className="font-medium text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> “{done.name}” is now hidden and removed from your visible wallets.
          </p>
          <p className="text-muted-foreground flex items-start gap-1.5">
            <Trash2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Its app record (label, address, cached balance) is deleted — it no longer
            appears in the list above or elsewhere in the app. It opens only by
            entering its reveal secret at the normal unlock screen.
          </p>

          {/* Reveal verification — prove it's recoverable ONLY by the right secret. */}
          <div className="pt-1">
            <Label className="text-[11px]">Verify it reveals only with its secret</Label>
            <div className="flex gap-2 mt-1">
              <Input className="h-8 text-xs" value={verifySecret} onChange={(e) => setVerifySecret(e.target.value)} placeholder="enter the reveal secret (or a wrong one)" />
              <Button size="sm" variant="outline" disabled={!verifySecret} onClick={() => verifyReveal(verifySecret)}>Check</Button>
            </div>
            {peek && !peek.loading && (
              peek.address
                ? <p className="text-[11px] text-success mt-1">✓ Revealed wallet address: <span className="font-mono">{short(peek.address)}</span>{peek.address.toLowerCase() === (done.address || "").toLowerCase() ? " — matches the wallet you hid" : ""}</p>
                : <p className="text-[11px] text-muted-foreground mt-1">No wallet revealed for that secret (a wrong secret looks exactly like “nothing here”).</p>
            )}
          </div>
        </div>
      )}
      {gateModal}
    </div>
  );
}

export default function StealthWallets() {
  const wallet = useWallet();
  const {
    isUnlocked, isHidden, isDecoy, accounts, btcAccount, solAccount,
    hasVault, addHiddenWallet, initStealthPool, removeAllHiddenWallets,
    createWallet, unlock, lock, clearVault,
  } = wallet;
  const { requireTwoFactor, gateModal } = useActionGuard();

  // ----- create card state -----
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPhrase, setSavedPhrase] = useState("");      // hidden mnemonic (once)
  const [savedIdentity, setSavedIdentity] = useState(null); // { evm, btc, sol } addresses
  const [copied, setCopied] = useState("");

  // ----- live demo state -----
  const [vaultExists, setVaultExists] = useState(false);
  const [realAddr, setRealAddr] = useState("");      // demo oracle: visible EVM address
  const [hiddenOracle, setHiddenOracle] = useState(""); // demo oracle: hidden EVM address
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
    setError(""); setSavedPhrase(""); setSavedIdentity(null);
    if (secret.length < 4) { setError("Reveal secret must be at least 4 characters"); return; }
    if (secret !== confirm) { setError("Secrets do not match"); return; }
    // CRITICAL: creating a hidden wallet is gated behind the second factor when one
    // is set (no-op otherwise). Runs after local validation.
    requireTwoFactor(async () => {
      setSaving(true);
      try {
        const { mnemonic, evm, btc, sol } = await addHiddenWallet(secret);
        setSavedPhrase(mnemonic);
        setSavedIdentity({ evm: evm.address, btc: btc.address, sol: sol.address });
        setSecret(""); setConfirm("");
        await refresh();
      } catch (e) {
        setError(e?.message || "Could not create hidden wallet");
      } finally {
        setSaving(false);
      }
    }, { title: "Create a hidden wallet" });
  };

  // ----- demo handlers (use the REAL unlock path) -----
  const demoSetup = async () => {
    setBusy("Setting up demo…"); setTryErr("");
    try {
      // Create a throwaway REAL (visible) vault (idempotent: skip if one exists).
      if (!(await hasVault())) {
        await createWallet(DEMO_REAL_PW);
      }
      if (accounts?.[0]?.address) setRealAddr(accounts[0].address);
      await initStealthPool();
      // Create the hidden wallet and SEED small plausible balances on ALL THREE of
      // its chains (demo simulation of real on-chain top-ups).
      const { evm, btc, sol } = await addHiddenWallet(DEMO_HIDDEN_SECRET);
      setHiddenOracle(evm.address);
      seedDemoHiddenBalance("evm", evm.address, DEMO_AMOUNTS.evm);
      seedDemoHiddenBalance("btc", btc.address, DEMO_AMOUNTS.btc);
      seedDemoHiddenBalance("sol", sol.address, DEMO_AMOUNTS.sol);
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
      setRealAddr(""); setHiddenOracle("");
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

  // The CURRENT session's multi-chain identity (visible or revealed-hidden), read
  // straight from the provider — which derived BTC/SOL via the SAME deriveBtc/
  // deriveSol it uses for any wallet. Proves a revealed hidden wallet is fully
  // multi-chain with no extra logic here.
  const currentIdentity = {
    evm: accounts?.[0]?.address,
    btc: btcAccount?.address,
    sol: solAccount?.address,
  };

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

      {/* VULN-4 storage isolation disclosure */}

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a hidden wallet with its own reveal secret. It appears nowhere in the app. Enter its secret at the normal unlock screen and the app opens that wallet instead of your visible one.
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
          <li>A fixed pool of identical slots — some real, most decoys — never reveals the count.</li>
          <li>The pool exists for every wallet, so it proves "this device has VEYRNOX", not "hidden wallets".</li>
          <li>Hidden in the app, not on-chain — addresses and history stay public.</li>
          <li>No list is kept: a forgotten secret makes that wallet unrecoverable here.</li>
          <li>Back up each seed immediately — a second hidden wallet can silently replace the first in the same slot.</li>
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
          <div className="p-2.5 rounded-lg bg-caution/10 border border-caution/20 text-[11px] text-caution flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Make it different from your main PIN and Emergency PIN — if it matches, that one opens instead.
            </span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!secret || !confirm || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create hidden wallet"}
          </Button>
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20 text-xs space-y-3">
            <p className="font-medium text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Hidden wallet created. It won&apos;t show up anywhere in the app. It opens only with its secret.
            </p>

            {savedIdentity && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Fund any chain (send a small testnet amount to the matching address):
                </p>
                <MultiChainIdentity addresses={savedIdentity} copy={copy} copied={copied} idPrefix="new" />
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

      {/* Move an existing (previously-visible) wallet into hidden */}
      <MoveExistingWallet />

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
            <code>{DEMO_HIDDEN_SECRET}</code>) seeded with small balances on all three
            chains. Then unlock with either to compare — and note the visible session
            shows <b>no</b> sign the hidden wallet exists.
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {isHidden
                    ? <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-500 text-xs font-semibold">HIDDEN WALLET</span>
                    : <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 text-xs font-semibold">VISIBLE WALLET</span>}
                  <span className="text-[11px] text-muted-foreground">full multi-chain identity</span>
                </div>

                <MultiChainIdentity addresses={currentIdentity} copy={copy} copied={copied} idPrefix="session" />

                {isHidden ? (
                  <p className="text-xs text-muted-foreground">
                    Revealed via its secret. This session exposes only the hidden
                    wallet's own addresses. The visible wallet is not referenced.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is the visible wallet. The app shows no sign in the app that a hidden wallet exists.
                  </p>
                )}

                {/* DEMO ORACLE — proves the visible session never shows the hidden
                    EVM address (and vice versa). Real apps never reveal this. */}
                {(realAddr || hiddenOracle) && (
                  <div className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-1 space-y-0.5">
                    {realAddr && <p>demo oracle — visible EVM address: {short(realAddr)}</p>}
                    {hiddenOracle && (
                      <p>
                        demo oracle — hidden EVM address: {short(hiddenOracle)}{" "}
                        {!isHidden && currentIdentity.evm === realAddr && currentIdentity.evm !== hiddenOracle
                          ? "✓ absent from this visible session"
                          : isHidden && currentIdentity.evm === hiddenOracle
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
            Lock your wallet and enter the reveal secret to open the hidden wallet. Never share a reveal secret — there is no list and no reset.
          </p>
        </div>
      )}
      {gateModal}
    </div>
  );
}
