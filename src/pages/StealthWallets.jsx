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
import { useTranslation } from "react-i18next";
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
import { Button as ButtonBase } from "@/components/ui/button";
import { Input as InputBase } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label as LabelBase } from "@/components/ui/label";
/** @type {React.ComponentType<any>} */
const Button = ButtonBase;
/** @type {React.ComponentType<any>} */
const Input = InputBase;
/** @type {React.ComponentType<any>} */
const Label = LabelBase;

// Fixed demo credentials so the simulator walkthrough is one-click reproducible.
// DEMO ONLY — never used outside the demonstration panel.
const DEMO_REAL_PW = "main-pass-2468";
const DEMO_HIDDEN_SECRET = "hidden-key-9753";
// Small, plausible per-chain balances to seed in the demo.
const DEMO_AMOUNTS = { evm: "0.0231", btc: "0.0007", sol: "0.42" };

function short(addr, dash) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : dash;
}

// Renders a hidden wallet's EVM + BTC + SOL addresses with copy + explorer links,
// and an OPT-IN balance check. Balances are NOT fetched until the user asks (each
// check is a phone-home to a public node — see lib/hiddenBalance.js). `addresses`
// is a { evm, btc, sol } map of address strings.
function MultiChainIdentity({ addresses, copy, copied, idPrefix }) {
  const { t } = useTranslation("security");
  const [balances, setBalances] = useState(/** @type {Record<string, any>|null} */(null)); // null = not checked yet
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
        catch (/** @type {any} */ e) { out[c.key] = { error: e?.message || "read failed" }; }
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
              <button onClick={() => copy(address, `${idPrefix}-${c.key}`)} title={t("stealth.identity.copy_address_title", { label: c.label })} aria-label={t("stealth.identity.copy_address_title", { label: c.label })} className="shrink-0">
                {copied === `${idPrefix}-${c.key}` ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {c.explorer(address) && (
                <a href={c.explorer(address) ?? undefined} target="_blank" rel="noreferrer" title={t("stealth.identity.view_on_explorer")} aria-label={t("stealth.identity.view_on_explorer_label", { label: c.label })} className="shrink-0">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t("stealth.identity.balance_label")}</span>
              <span className="font-semibold">
                {!balances ? (
                  <span className="text-muted-foreground">{t("stealth.identity.balance_not_checked")}</span>
                ) : b?.error ? (
                  <span className="text-muted-foreground" title={b.error}>{t("stealth.identity.balance_unavailable")}</span>
                ) : (
                  <>
                    {Number(b.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} {b.unit}
                    <span className="ms-1 text-[10px] font-normal text-muted-foreground">
                      {b.source === "chain" ? t("stealth.identity.source_live") : t("stealth.identity.source_demo")}
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
          <Wifi className="h-3 w-3" /> {checking ? t("stealth.identity.checking_cta") : balances ? t("stealth.identity.recheck_cta") : t("stealth.identity.check_cta")}
        </button>
        {DEMO && (
          <button onClick={demoFundAll} className="inline-flex items-center gap-1 text-primary text-[11px]">
            <Coins className="h-3 w-3" /> {t("stealth.identity.simulate_funding")}
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
        <Globe className="h-3 w-3 mt-0.5 shrink-0" />
        {t("stealth.identity.opt_in_note")}
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
  const { t } = useTranslation("security");
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
  const [done, setDone] = useState(/** @type {{name: string, address: string|null|undefined}|null} */(null));     // { name, address }
  const [peek, setPeek] = useState(/** @type {{loading: boolean, address?: string|null}|null} */(null));      // reveal-verification result
  const [verifySecret, setVerifySecret] = useState("");

  const selected = evmWallets.find((w) => w.id === selId) || null;

  const reset = () => {
    setSelId(""); setPhrase(""); setSecret(""); setConfirm(""); setError("");
  };

  const handleMove = async () => {
    setError(""); setPeek(null);
    if (!selected) { setError(t("stealth.move.err_select")); return; }
    const m = phrase.trim().replace(/\s+/g, " ");
    if (secret.length < 4) { setError(t("stealth.move.err_secret_length")); return; }
    if (secret !== confirm) { setError(t("stealth.move.err_secret_mismatch")); return; }
    // Address-match: you can only hide a wallet you actually hold the keys to (and
    // you're hiding the one you selected, not a different wallet).
    let derived;
    try { derived = deriveAddressFromMnemonic(m, 0); }
    catch { setError(t("stealth.move.err_phrase_invalid")); return; }
    if (derived.toLowerCase() !== (selected.address || "").toLowerCase()) {
      setError(t("stealth.move.err_phrase_mismatch"));
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
      } catch (/** @type {any} */ e) {
        setError(e?.message || t("stealth.move.err_generic"));
      } finally {
        setBusy(false);
      }
    }, { title: t("stealth.move.gate_title") });
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
      const address = deriveAddressFromMnemonic(DEMO_MOVE_MNEMONIC, 0);
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
        <span className="font-medium">{t("stealth.move.title")}</span>
      </div>

      {/* TRANSITION-TELL WARNING — must be shown before hiding a visible wallet. */}
      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] text-destructive space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert className="h-4 w-4" /> {t("stealth.move.transition_warning_leading")}
        </div>
        <p>{t("stealth.move.transition_warning_body")}</p>
      </div>

      {/* Live visible-wallet list — so the disappearance after a move is visible.
          DENIABILITY (CLAUDE.md "never show wallet count/list"): the heading must
          NOT interpolate the visible-wallet count — that publishes the active-
          context cardinality. The selectable list below is functionally required
          (the user picks which wallet to hide), but the count is not. */}
      <div className="text-[11px] text-muted-foreground">
        {t("stealth.move.pick_prompt")}
      </div>
      <div className="space-y-1.5">
        {evmWallets.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("stealth.move.no_evm_wallets")}</p>
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
            <Label className="text-xs">{t("stealth.move.phrase_label", { name: selected.name })}</Label>
            <textarea
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              rows={2}
              placeholder={t("stealth.move.phrase_placeholder")}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("stealth.move.phrase_note")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="stealth-secret-input" className="text-xs">{t("stealth.move.secret_label")}</Label>
              <PasswordInput id="stealth-secret-input" className="mt-1" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("stealth.move.secret_placeholder")} />
            </div>
            <div>
              <Label htmlFor="stealth-secret-confirm" className="text-xs">{t("stealth.move.confirm_label")}</Label>
              <PasswordInput id="stealth-secret-confirm" className="mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("stealth.move.confirm_placeholder")} />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button variant="destructive" className="w-full gap-1.5" disabled={busy} onClick={handleMove}>
            <FolderInput className="h-4 w-4" /> {busy ? t("stealth.move.hide_cta_busy") : t("stealth.move.hide_cta")}
          </Button>
        </div>
      )}

      {!selected && error && <p className="text-xs text-destructive">{error}</p>}

      {DEMO && (
        <div className="pt-1 border-t border-border">
          <Button size="sm" variant="secondary" className="mt-3 gap-1.5" disabled={busy} onClick={demoSetup}>
            <FlaskConical className="h-3.5 w-3.5" /> {t("stealth.move.demo_cta")}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {t("stealth.move.demo_note", { secret: DEMO_MOVE_SECRET })}
          </p>
        </div>
      )}

      {done && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-xs space-y-2">
          <p className="font-medium text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> {t("stealth.move.done_message", { name: done.name })}
          </p>
          <p className="text-muted-foreground flex items-start gap-1.5">
            <Trash2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {t("stealth.move.record_deleted_note")}
          </p>

          {/* Reveal verification — prove it's recoverable ONLY by the right secret. */}
          <div className="pt-1">
            <Label htmlFor="stealth-verify-input" className="text-[11px]">{t("stealth.move.verify_label")}</Label>
            <div className="flex gap-2 mt-1">
              <Input id="stealth-verify-input" className="h-8 text-xs" value={verifySecret} onChange={(e) => setVerifySecret(e.target.value)} placeholder={t("stealth.move.verify_placeholder")} />
              <Button size="sm" variant="outline" disabled={!verifySecret} onClick={() => verifyReveal(verifySecret)}>{t("stealth.move.verify_cta")}</Button>
            </div>
            {peek && !peek.loading && (
              peek.address
                ? <p className="text-[11px] text-success mt-1">{t("stealth.move.verify_ok_prefix")} <span className="font-mono">{short(peek.address, t("stealth.address_dash"))}</span>{peek.address.toLowerCase() === (done.address || "").toLowerCase() ? ` ${t("stealth.move.verify_ok_match")}` : ""}</p>
                : <p className="text-[11px] text-muted-foreground mt-1">{t("stealth.move.verify_none")}</p>
            )}
          </div>
        </div>
      )}
      {gateModal}
    </div>
  );
}

export default function StealthWallets() {
  const { t } = useTranslation("security");
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
  const [savedIdentity, setSavedIdentity] = useState(/** @type {{evm: string, btc: string, sol: string}|null} */(null)); // { evm, btc, sol } addresses
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
    if (secret.length < 4) { setError(t("stealth.create.err_secret_length")); return; }
    if (secret !== confirm) { setError(t("stealth.create.err_secret_mismatch")); return; }
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
      } catch (/** @type {any} */ e) {
        setError(e?.message || t("stealth.create.err_generic"));
      } finally {
        setSaving(false);
      }
    }, { title: t("stealth.create.gate_title") });
  };

  // ----- demo handlers (use the REAL unlock path) -----
  const demoSetup = async () => {
    setBusy(t("stealth.demo.setup_busy")); setTryErr("");
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
    } catch (/** @type {any} */ e) {
      setTryErr(e?.message || t("stealth.demo.setup_err"));
    } finally {
      setBusy("");
    }
  };

  const demoUnlock = async (pw) => {
    setTryErr(""); setBusy(t("stealth.demo.unlock_busy"));
    try {
      await unlock(pw);
    } catch (/** @type {any} */ e) {
      // SAME generic error whether or not a hidden wallet exists — no tell.
      setTryErr(e?.message || t("stealth.demo.unlock_err_generic"));
    } finally {
      setBusy("");
    }
  };

  const demoReset = async () => {
    setBusy(t("stealth.demo.reset_busy")); setTryErr("");
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
          <Ghost className="h-5 w-5 text-primary" /> {t("stealth.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("stealth.subhead")}
        </p>
      </div>

      {/* VULN-4 storage isolation disclosure */}
      <div
        data-testid="stealth-storage-disclosure"
        className="flex items-start gap-2 rounded-lg bg-caution/10 border border-caution/30 px-3 py-2"
      >
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {t("stealth.storage_disclosure")}
        </p>
      </div>

      <div className="p-3 rounded-lg bg-caution/10 border border-caution/20 text-caution text-xs flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          {t("stealth.identical_slots_note")}
        </span>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{t("stealth.how_title")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("stealth.how_body")}
            </p>
          </div>
        </div>
      </div>

      {/* Deniability model — be honest */}
      <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-2">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t("stealth.protects_title")}</p>
        </div>
        <ul className="text-[11px] text-muted-foreground list-disc ps-4 space-y-0.5">
          {/** @type {string[]} */ (t("stealth.protects_items", { returnObjects: true })).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Create card */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Ghost className="h-5 w-5 text-primary" />
          <span className="font-medium">{t("stealth.create.title")}</span>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="stealth-create-secret">{t("stealth.create.secret_label")}</Label>
            <div className="relative mt-1.5">
              <Input
                id="stealth-create-secret"
                type={showSecret ? "text" : "password"}
                maxLength={64}
                placeholder={t("stealth.create.secret_placeholder")}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="pe-10 tracking-widest text-lg"
              />
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowSecret((s) => !s)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="stealth-create-confirm">{t("stealth.create.confirm_label")}</Label>
            <Input
              id="stealth-create-confirm"
              type={showSecret ? "text" : "password"}
              maxLength={64}
              placeholder={t("stealth.create.confirm_placeholder")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 tracking-widest text-lg"
            />
          </div>
          <div className="p-2.5 rounded-lg bg-caution/10 border border-caution/20 text-[11px] text-caution flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {t("stealth.create.warn_note")}
            </span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={!secret || !confirm || saving} onClick={handleCreate}>
            {saving ? t("stealth.create.cta_busy") : t("stealth.create.cta")}
          </Button>
        </div>

        {savedPhrase && (
          <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20 text-xs space-y-3">
            <p className="font-medium text-success flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> {t("stealth.create.saved_ok")}
            </p>

            {savedIdentity && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t("stealth.create.fund_prompt")}
                </p>
                <MultiChainIdentity addresses={savedIdentity} copy={copy} copied={copied} idPrefix="new" />
              </div>
            )}

            <div>
              <p className="text-muted-foreground">
                {t("stealth.create.phrase_note")}
              </p>
              <code className="block break-words rounded bg-background p-2 text-foreground mt-1">{savedPhrase}</code>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t("stealth.create.reminder_note")}
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
            <span className="font-semibold">{t("stealth.demo.title")}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("stealth.demo.body", { real: DEMO_REAL_PW, secret: DEMO_HIDDEN_SECRET })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={demoSetup}>
              {t("stealth.demo.step1")}
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_REAL_PW)}>
              <Unlock className="h-3.5 w-3.5 me-1" /> {t("stealth.demo.unlock_visible")}
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !vaultExists} onClick={() => demoUnlock(DEMO_HIDDEN_SECRET)}>
              <Ghost className="h-3.5 w-3.5 me-1" /> {t("stealth.demo.reveal_hidden")}
            </Button>
            {isUnlocked && (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5 me-1" /> {t("stealth.demo.lock")}
              </Button>
            )}
          </div>

          {/* Free-form unlock to prove a wrong secret fails identically */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="stealth-demo-input" className="text-xs">{t("stealth.demo.try_label")}</Label>
              <Input
                id="stealth-demo-input"
                className="mt-1"
                value={tryPw}
                onChange={(e) => setTryPw(e.target.value)}
                placeholder={t("stealth.demo.try_placeholder")}
              />
            </div>
            <Button size="sm" disabled={!!busy || !tryPw || !vaultExists} onClick={() => demoUnlock(tryPw)}>
              {t("stealth.demo.unlock_cta")}
            </Button>
          </div>

          {busy && <p className="text-xs text-muted-foreground">{busy}</p>}
          {tryErr && (
            <p className="text-xs text-destructive">
              {tryErr} <span className="text-muted-foreground">{t("stealth.demo.wrong_secret_hint")}</span>
            </p>
          )}

          {/* Result panel */}
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            {!isUnlocked ? (
              <p className="text-muted-foreground">{t("stealth.demo.locked")}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {isHidden
                    ? <span className="px-2 py-0.5 rounded bg-caution/10 text-caution text-xs font-semibold">{t("stealth.demo.hidden_badge")}</span>
                    : <span className="px-2 py-0.5 rounded bg-success/10 text-success text-xs font-semibold">{t("stealth.demo.visible_badge")}</span>}
                  <span className="text-[11px] text-muted-foreground">{t("stealth.demo.full_identity_note")}</span>
                </div>

                <MultiChainIdentity addresses={currentIdentity} copy={copy} copied={copied} idPrefix="session" />

                {isHidden ? (
                  <p className="text-xs text-muted-foreground">
                    {t("stealth.demo.hidden_body")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("stealth.demo.visible_body")}
                  </p>
                )}

                {/* DEMO ORACLE — proves the visible session never shows the hidden
                    EVM address (and vice versa). Real apps never reveal this. */}
                {(realAddr || hiddenOracle) && (
                  <div className="text-[11px] text-muted-foreground/70 border-t border-border pt-2 mt-1 space-y-0.5">
                    {realAddr && <p>{t("stealth.demo.oracle_visible", { addr: short(realAddr, t("stealth.address_dash")) })}</p>}
                    {hiddenOracle && (
                      <p>
                        {t("stealth.demo.oracle_hidden", { addr: short(hiddenOracle, t("stealth.address_dash")) })}{" "}
                        {!isHidden && currentIdentity.evm === realAddr && currentIdentity.evm !== hiddenOracle
                          ? t("stealth.demo.oracle_hidden_absent_from_visible")
                          : isHidden && currentIdentity.evm === hiddenOracle
                            ? t("stealth.demo.oracle_hidden_is_current")
                            : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button size="sm" variant="destructive" disabled={!!busy} onClick={demoReset}>
            {t("stealth.demo.reset_cta")}
          </Button>
        </div>
      )}

      {!DEMO && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border">
          <p className="text-xs text-muted-foreground">
            {t("stealth.non_demo_hint")}
          </p>
        </div>
      )}
      {gateModal}
    </div>
  );
}
