// @ts-nocheck
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS } from "@/wallet-core/assets";
import { resolveReceive } from "@/lib/receiveAddress";
import { demoSendSource } from "@/lib/sendWalletSource";
import { DEMO } from "@/api/demoClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2, Lock, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import QRCodeDisplay from "../components/QRCodeDisplay";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import CoinLogo from "@/components/CoinLogo";
import { toast } from "sonner";

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
  const { isUnlocked, accounts, btcAccount, solAccount } = useWallet();
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

  const r = resolveReceive(symbol, { accounts: acc, btcAccount: btc, solAccount: sol });

  const copyAddress = async () => {
    if (!r?.address) return;
    try {
      await navigator.clipboard.writeText(r.address);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the address manually");
    }
  };

  // Per-asset "only send X here" guidance. The ERC-20 case is the dangerous one:
  // the address is the shared EVM address, so the network must be spelled out or a
  // user can lose a token by sending it on the wrong EVM chain.
  const networkName = r?.network?.name || r?.asset?.chain || "";
  let sendOnNote = null;
  if (r?.address) {
    if (r.isErc20) {
      sendOnNote = `${r.asset.symbol} is a token on an Ethereum-compatible network. This is your wallet address — only have the sender send ${r.asset.symbol} on ${networkName}. Sending it on a different network can permanently lose the funds.`;
    } else if (r.family === "evm") {
      sendOnNote = `This is your shared wallet address. Only send ${r.asset.name} on ${networkName} to this address, and make sure the sender uses ${networkName}.`;
    } else if (r.family === "btc") {
      sendOnNote = `Only send Bitcoin on ${networkName} to this address.`;
    } else if (r.family === "solana") {
      sendOnNote = `Only send Solana on ${networkName} to this address.`;
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {searchParams.get("asset") && <BackButton />}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive Crypto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Show a wallet address to receive funds</p>
      </div>

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        <div>
          <Label id="receive-asset-label">Asset</Label>
          <Select value={symbol} onValueChange={(v) => { setSymbol(v); setCopied(false); }}>
            <SelectTrigger className="mt-1.5 h-12 [&>span]:flex [&>span]:items-center [&>span]:gap-3" aria-labelledby="receive-asset-label">
              <SelectValue placeholder="Choose asset">
                {symbol ? (
                  <>
                    <CoinLogo symbol={symbol} size={32} />
                    <span>{ASSETS.find(a => a.symbol === symbol)?.name || symbol} — {symbol}</span>
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ASSETS.map((a) => (
                <SelectItem key={a.symbol} value={a.symbol}>
                  <div className="flex items-center gap-2">
                    <CoinLogo symbol={a.symbol} size={20} />
                    <span>{a.name} — {a.symbol}</span>
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
              Receiving <span className="font-semibold text-foreground">{r.asset.name} ({r.asset.symbol})</span> isn't
              available yet. No address is shown until this asset is enabled.
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
              <p className="text-sm font-medium">Wallet locked</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unlock your wallet to reveal your {r.asset.name} {r.network?.name ? `(${r.network.name})` : ""} receive address.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/hd-wallet">Open HD Wallet Manager <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        )}

        {/* Ready: show the QR, the unmistakable network label, the address + copy. */}
        {r && r.address && (
          <div className="space-y-4">
            {/* Unmistakable asset + network header */}
            <div className="text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <CoinLogo symbol={r.asset.symbol} size={22} />
                <p className="text-sm font-semibold">Your {r.asset.name} address</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1">
                <span className="text-xs font-medium">{r.network?.name || r.asset.chain}</span>
                {r.network?.isTestnet && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-caution">Testnet</span>
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
              <p className="text-[11px] text-muted-foreground text-center mb-1">{r.asset.symbol} receive address</p>
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5">
                <code className="mono-value text-xs flex-1 break-all">{r.address}</code>
                <Button size="icon" variant="ghost" className="relative h-11 w-11 shrink-0" onClick={copyAddress} aria-label={copied ? "Address copied to clipboard" : "Copy address"}>
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.span
                        key="check"
                        initial={reduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 18 }}
                        className="flex"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex"
                      >
                        <Copy className="h-3.5 w-3.5" />
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
          <p className="text-center text-sm text-muted-foreground py-8">Select an asset to receive.</p>
        )}
      </div>

      {!isUnlocked && !demo && (
        <p className="text-center text-[11px] text-muted-foreground">
          Addresses come from your on-device wallet and only appear while it's unlocked.
        </p>
      )}
    </div>
  );
}
