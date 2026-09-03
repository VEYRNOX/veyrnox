// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import BackButton from "@/components/BackButton";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS } from "@/wallet-core/assets";
import { assetDisplayLabel } from "@/lib/assetLabel";
import { resolveReceive } from "@/lib/receiveAddress";
import { isValidAddressForCurrency } from "@/lib/addressValidation";
import { demoSendSource } from "@/lib/sendWalletSource";
import { DEMO } from "@/api/demoClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2, Lock, Clock, AlertTriangle, ArrowRight, Share2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import QRCodeDisplay from "../components/QRCodeDisplay";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import CoinLogo from "@/components/CoinLogo";
import { toast } from "@/lib/toast";
import { trackEvent, EVENT } from "@/api/trackEvent";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";

// RECEIVE FLOW
//
// Shows the CORRECT receive address for the selected asset's chain, a QR that
// encodes exactly that address, a copy button, and an unmistakable network label.
//
// Address source of truth: the WalletProvider's already-derived public accounts
// (EVM secp256k1, BTC bech32, SOL base58). We never re-derive or touch wallet-core
// crypto here — resolveReceive() just maps the asset to the right derived address.
// While the wallet is locked (or a chain account isn't derived yet) there is no
// address to show, and we render the locked state.
export default function ReceiveCrypto() {
  const { t } = useTranslation("wallet");
  const { isUnlocked, accounts, btcAccount, solAccount, isDecoy, isHidden } = useWallet();
  const deniable = isDecoy || isHidden;
  const [searchParams] = useSearchParams();
  const urlAsset = searchParams.get("asset") ?? "ETH";
  const [symbol, setSymbol] = useState(urlAsset);
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();

  // Re-sync on ?asset= change — useState reads its initializer only at mount, so
  // without this a nav from /asset/BTC → /receive?asset=BTC would still show ETH (#829).
  useEffect(() => {
    setSymbol(urlAsset);
    setCopied(false);
  }, [urlAsset]);

  useEffect(() => {
    // Codex P3 2026-08-15: local I3 chokepoint on the page itself. trackEvent
    // already suppresses egress in deniability downstream (api/trackEvent.js),
    // but relying only on the remote gate leaves this surface non-self-
    // defensive — a future trackEvent refactor could regress silently. Two
    // chokepoints is the K-2 pattern used across the app.
    if (deniable) return;
    const known = ASSETS.some(a => a.symbol === urlAsset);
    void trackEvent(EVENT.RECEIVE_VIEWED, known ? { asset: urlAsset } : {}).catch(() => {});
  }, [urlAsset, deniable]);

  // DEMO address source. A backend-less walkthrough has no unlocked vault, so the
  // derived accounts are empty and EVERY asset would render the locked "unlock to
  // reveal" state. Reuse the SAME demo wallet source the Send form uses, so the demo
  // receive address per chain matches the demo send "from" address (one wallet) and
  // the walkthrough actually shows a QR/address. Demo-only: in a real session this is
  // skipped and the live derived accounts are used unchanged.
  const demo = DEMO && !accounts?.length ? demoSendSource() : null;
  const acc = demo ? demo.accounts : accounts;
  const btc = demo ? demo.btcAccount : btcAccount;
  const sol = demo ? demo.solAccount : solAccount;

  const rRaw = resolveReceive(symbol, { accounts: acc, btcAccount: btc, solAccount: sol });
  // Codex P2 2026-08-15: fund-safety guard. If a malformed/spoofed string ever
  // reaches resolveReceive() (regression in address derivation, a mocked
  // account, a corrupted state slot), the UI must NOT render / QR-encode /
  // copy it as authoritative — the user would then hand a bad address to a
  // sender and lose funds. Re-validate with the same family-aware validator
  // the Send flow uses; on reject, strip the address and let the "locked /
  // no address" branch below render the honest fallback.
  const r = rRaw && rRaw.address && !isValidAddressForCurrency(rRaw.address, rRaw.asset?.symbol, rRaw.network?.name)
    ? { ...rRaw, address: null }
    : rRaw;

  // Codex P2 2026-08-15: clipboard-hygiene plumbing for deniable sessions.
  // The address the user copies IS a real address they need to share, so we
  // can't refuse the copy. But in a decoy/hidden session that address (a
  // real testnet or hidden-wallet address) would sit in OS clipboard
  // history + cross-app paste indefinitely after the wallet relocks — a
  // coercer can then read it. Bounded exposure: track the copied string and
  // overwrite the clipboard with an empty string after a short TTL AND on
  // unmount. Neither fully clears OS clipboard HISTORY (Android 13+ / iOS
  // keep it regardless), but the CURRENT clipboard no longer holds the
  // address once TTL fires. Honest ceiling — see the docs/ note if more is
  // needed. ponytail: global timer, per-session token if this becomes hot.
  const CLIPBOARD_CLEAR_MS = 60_000;
  const clipboardTimerRef = useRef(null);
  const lastCopiedRef = useRef(null);

  const scheduleClipboardClear = () => {
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    clipboardTimerRef.current = setTimeout(async () => {
      try {
        // Only clear if the clipboard still holds what we wrote — we don't
        // want to stomp on something the user copied elsewhere afterwards.
        const cur = await navigator.clipboard.readText().catch(() => null);
        if (cur && cur === lastCopiedRef.current) {
          await navigator.clipboard.writeText('');
        }
      } catch { /* readText requires a user gesture in some browsers — skip */ }
      lastCopiedRef.current = null;
    }, CLIPBOARD_CLEAR_MS);
  };

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      // Best-effort synchronous clear on unmount — if the write is still
      // there when we leave the page, blank it. No await — unmount is sync.
      if (deniable && lastCopiedRef.current) {
        try { navigator.clipboard.writeText(''); } catch { /* noop */ }
      }
    };
  }, [deniable]);

  const copyAddress = async () => {
    if (!r?.address) return;
    try {
      await navigator.clipboard.writeText(r.address);
      setCopied(true);
      toast.success(t("receive.copy.copied_toast"));
      setTimeout(() => setCopied(false), 2000);
      // Only auto-clear in deniable sessions — a real-session user copying
      // their own address expects the clipboard to persist until they paste
      // it (Slack, email, etc.).
      if (deniable) {
        lastCopiedRef.current = r.address;
        scheduleClipboardClear();
      }
    } catch {
      toast.error(t("receive.copy.copy_failed_toast"));
    }
  };

  // Native share sheet on iOS/Android via Capacitor Share plugin; Web Share
  // API on web when the browser supports it; fall back to copyAddress otherwise
  // so the button is never a dead end. Deniable-session clipboard hygiene
  // only applies to the copy fallback (the native sheet doesn't touch the
  // clipboard). ponytail: single share text is the address; add a link/QR
  // image only if the UX asks for it later.
  const shareAddress = async () => {
    if (!r?.address) return;
    const text = r.address;
    const title = t("receive.actions.share_dialog_title");
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title, text, dialogTitle: title });
        return;
      }
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return;
      }
      await copyAddress();
    } catch (err) {
      // User dismissal is not an error — Capacitor rejects with a "canceled"
      // shape, Web Share throws AbortError. Neither should toast.
      const msg = String(err?.message || err || "");
      if (/cancel|abort/i.test(msg) || err?.name === "AbortError") return;
      toast.error(t("receive.actions.share_failed_toast"));
    }
  };

  // Per-asset "only send X here" guidance. The ERC-20 case is the dangerous one:
  // the address is the shared EVM address, so the network must be spelled out or a
  // user can lose a token by sending it on the wrong EVM chain.
  const networkName = r?.network?.name || r?.asset?.chain || "";
  let sendOnNote = null;
  if (r?.address) {
    if (r.isErc20) {
      sendOnNote = t("receive.network_notes.erc20", { symbol: r.asset.symbol, network: networkName });
    } else if (r.family === "evm") {
      sendOnNote = t("receive.network_notes.evm", { name: r.asset.name, network: networkName });
    } else if (r.family === "btc") {
      sendOnNote = t("receive.network_notes.btc", { network: networkName });
    } else if (r.family === "solana") {
      sendOnNote = t("receive.network_notes.solana", { network: networkName });
    }
  }

  useAdvisorSnapshot({
    receive_crypto: {
      selected_asset: symbol,
      network: r?.network?.name || null,
      receivable: r?.receivable ?? null,
      has_address: !!r?.address,
      unlocked: isUnlocked,
    },
  });

  return (
    <div className="max-w-md mx-auto space-y-6">
      {searchParams.get("asset") && <BackButton />}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("receive.heading")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("receive.subheading")}</p>
      </div>

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        <div>
          <Label id="receive-asset-label">{t("receive.asset_label")}</Label>
          <Select value={symbol} onValueChange={(v) => { setSymbol(v); setCopied(false); }}>
            <SelectTrigger className="mt-1.5 h-12 [&>span]:flex [&>span]:items-center [&>span]:gap-3" aria-labelledby="receive-asset-label">
              <SelectValue placeholder={t("receive.asset_placeholder")}>
                {symbol ? (
                  <>
                    <CoinLogo symbol={symbol} size={32} />
                    <span>{assetDisplayLabel(symbol)}</span>
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ASSETS.map((a) => (
                <SelectItem key={a.symbol} value={a.symbol}>
                  <div className="flex items-center gap-2">
                    <CoinLogo symbol={a.symbol} size={20} />
                    <span>{assetDisplayLabel(a)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* coming_soon assets (e.g. USDT): no address exists yet, by design. */}
        {r && !r.receivable && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-secondary/60 border border-border">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              {t("receive.not_available", { name: r.asset.name, symbol: r.asset.symbol })}
            </p>
          </div>
        )}

        {/* Locked: a receivable asset, but the wallet (or this chain's account) is
            locked, so there is no address to reveal. */}
        {r && r.receivable && !r.address && (
          <div className="space-y-3 text-center py-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-caution/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-caution" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("receive.locked.title")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("receive.locked.body", { asset: r.asset.name, network: r.network?.name ? `(${r.network.name})` : "" })}
              </p>
            </div>
            {/* Icon mirrors under dir="rtl" — forward navigation link arrow. */}
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/hd-wallet">{t("receive.locked.open_hd_wallet")} <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" /></Link>
            </Button>
          </div>
        )}

        {/* Ready: show the QR, the unmistakable network label, the address + copy. */}
        {r && r.address && (
          <div className="space-y-4">
            {/* Unmistakable asset + network header. The name/icon links to
                the Home dashboard so a viewer who deep-linked in via
                ?asset=X (no BackButton in that path) still has a one-tap
                return, and users who navigated in via the selector get a
                consistent affordance. */}
            <div className="text-center space-y-1.5">
              <Link to="/" className="inline-flex items-center justify-center gap-2 hover:text-primary transition-colors" aria-label={t("receive.locked.open_hd_wallet")}>
                <CoinLogo symbol={r.asset.symbol} size={22} />
                <p className="text-sm font-semibold">{t("receive.your_address", { asset: r.asset.name })}</p>
              </Link>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1">
                <span className="text-xs font-medium">{r.network?.name || r.asset.chain}</span>
                {r.network?.isTestnet && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-caution">{t("receive.testnet_badge")}</span>
                )}
              </div>
            </div>

            <motion.div
              key={r.address}
              initial={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 22 }}
              className="flex justify-center"
            >
              <QRCodeDisplay address={r.address} size={200} />
            </motion.div>

            <motion.div
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-[11px] text-muted-foreground text-center mb-1">{t("receive.receive_address_label", { symbol: r.asset.symbol })}</p>
              <div className="bg-secondary rounded-lg px-3 py-2.5">
                <code className="mono-value text-xs block break-all text-center">{r.address}</code>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-12 gap-2"
                  onClick={shareAddress}
                  aria-label={t("receive.actions.share")}
                >
                  <Share2 className="h-4 w-4" />
                  {t("receive.actions.share")}
                </Button>
                <Button
                  className="h-12 gap-2"
                  onClick={copyAddress}
                  aria-label={copied ? t("receive.copy.copied_aria") : t("receive.copy.copy_aria")}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.span
                        key="check"
                        initial={reduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 18 }}
                        className="inline-flex items-center gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t("receive.actions.copied")}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="inline-flex items-center gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        {t("receive.actions.copy")}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </motion.div>

            {sendOnNote && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${r.isErc20 ? "bg-caution/10 border-caution/40" : "bg-secondary/60 border-border"}`}>
                <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${r.isErc20 ? "text-caution" : "text-muted-foreground"}`} />
                <p className={`text-xs ${r.isErc20 ? "text-caution" : "text-muted-foreground"}`}>{sendOnNote}</p>
              </div>
            )}
          </div>
        )}

        {/* Defensive: unknown symbol (should not happen — selector is asset-bound). */}
        {!r && (
          <p className="text-center text-sm text-muted-foreground py-8">{t("receive.select_asset_prompt")}</p>
        )}
      </div>

      {!isUnlocked && !demo && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("receive.unlock_footer_note")}
        </p>
      )}
    </div>
  );
}
