// @ts-nocheck
// src/pages/FeeAnalytics.jsx
//
// Slice 1 — STATELESS native-unit fee analytics. Reads the active set's per-asset
// chain history via the SAME on-demand fetch the history view uses (no new data
// source, no persistence, no fiat), and aggregates the fees THIS set actually
// paid via src/analytics/feeAnalytics.js. Honest by construction:
//   - EVM has no in-app history (no JSON-RPC list method, no third-party indexer
//     by design) → fee analytics is "unavailable", with the explorer fallback.
//   - A locked wallet is indeterminate, not "$0 / no fees".
//   - A paid tx whose fee the indexer didn't report is surfaced as "unknown",
//     never folded into the total as a guess.
// Native units only — fiat cost basis is Slice 2 (audit-gated), deliberately not
// here. Verifiable values are set in IBM Plex Mono (font-mono); prose in the
// default sans (Schibsted Grotesk) per the design system.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Fuel, ArrowUpRight, ArrowLeftRight, CheckCircle2, XCircle, Clock,
  ExternalLink, Loader2, AlertTriangle, Lock, ShieldCheck, Info,
} from "lucide-react";
import { DEMO } from "@/api/demoClient";
import { ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS, canReceive } from "@/wallet-core/assets";
import { fetchAssetHistory, explorerAddressUrl } from "@/lib/txHistory";
import { computeFeeAnalytics } from "@/analytics/feeAnalytics";

// Fee analytics mirrors the wallet's receivable assets (an asset needs a derived
// address to have history). ETH is first/default — and is also the canonical
// "in-app history unavailable" case the view explains honestly.
const FEE_ASSETS = ASSETS.filter((a) => canReceive(a));

const statusMeta = {
  pending: { icon: Clock, cls: "text-caution", label: "Pending" },
  confirmed: { icon: CheckCircle2, cls: "text-primary", label: "Confirmed" },
  failed: { icon: XCircle, cls: "text-destructive", label: "Failed" },
};

const short = (a) => (a && a.length > 16 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a || "—");

// Resolve the derived address for the selected asset's family from the unlocked
// wallet. In demo mode this is unused (demo history is local sample data).
function addressFor(asset, wallet) {
  if (asset.family === "btc") return wallet.btcAccount?.address || null;
  if (asset.family === "solana") return wallet.solAccount?.address || null;
  return wallet.accounts?.[0]?.address || null; // evm / erc20 share one address
}

function StatCard({ label, value, symbol = undefined, mono = true }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-semibold text-lg ${mono ? "font-mono" : ""}`}>
        {value}{symbol ? <span className="text-sm text-muted-foreground"> {symbol}</span> : null}
      </p>
    </div>
  );
}

function FeeRow({ tx, symbol }) {
  const sMeta = statusMeta[tx.status] || statusMeta.confirmed;
  const StatusIcon = sMeta.icon;
  const DirIcon = tx.type === "self" ? ArrowLeftRight : ArrowUpRight;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-destructive/10">
        <DirIcon className="h-4 w-4 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium capitalize">{tx.type}</p>
          <StatusIcon className={`h-3.5 w-3.5 ${sMeta.cls}`} title={sMeta.label} />
          {tx.demo && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">Sample</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {tx.timestamp ? formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true }) : "awaiting confirmation"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold font-mono text-foreground">{tx.feeNative} {symbol}</p>
        <p className="text-[10px] text-muted-foreground">network fee</p>
      </div>
      {tx.explorerUrl && (
        <a
          href={tx.explorerUrl}
          target="_blank"
          rel="noreferrer"
          title="View on block explorer"
          className="shrink-0 p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function FeeAnalytics() {
  const wallet = useWallet();
  const [symbol, setSymbol] = useState("BTC"); // a chain with in-app history by default
  const asset = useMemo(() => FEE_ASSETS.find((a) => a.symbol === symbol) || FEE_ASSETS[0], [symbol]);
  const address = DEMO ? null : addressFor(asset, wallet);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["fee-analytics", asset.symbol, address, DEMO],
    queryFn: () => fetchAssetHistory({ asset, address, demo: DEMO }),
    // Like the history view, this is a snapshot the user explicitly opens — no
    // background refetch (that would repeat the address->indexer disclosure).
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: 1,
  });

  const source = data?.source;
  const analytics = useMemo(() => (data ? computeFeeAnalytics(data, asset) : null), [data, asset]);
  const lockedLive = !DEMO && data?.reason === "locked";
  const evmNoIndexer = data?.supported === false && data?.reason === "evm-no-indexer";
  const isErc20Empty = analytics?.available && analytics.paidTxCount === 0 && asset.family === "erc20";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" /> Fee Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Network fees you’ve paid, in native units, computed on-device from chain history — no fiat, nothing stored.
          </p>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? "Demo · sample data" : ALLOW_MAINNET ? "Mainnet" : "Testnet"}
        </span>
      </div>

      {/* Asset selector */}
      <div className="flex gap-2 flex-wrap">
        {FEE_ASSETS.map((a) => (
          <button
            key={a.symbol}
            onClick={() => setSymbol(a.symbol)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              a.symbol === symbol
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.symbol}
          </button>
        ))}
      </div>

      {/* Privacy / data-source disclosure — same honest phone-home note as history. */}
      {source && (
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold text-foreground">{source.networkName}</span>{" · "}
            {DEMO
              ? "Demo mode — nothing is queried over the network; the figures below are computed from local sample data."
              : source.privacyNote}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading {asset.symbol} history…
        </div>
      )}

      {isError && !isLoading && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Couldn’t read history: {error?.message || "the indexer/RPC didn’t respond"}.</span>
          </div>
          <button onClick={() => refetch()} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:border-primary">
            Retry
          </button>
        </div>
      )}

      {/* EVM: no in-app history → fees can't be computed in-app. Honest, not zero. */}
      {evmNoIndexer && !isLoading && (
        <div className="p-5 rounded-xl border border-dashed border-border bg-card/50 space-y-3 text-center">
          <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-medium">Fee analytics isn’t available in-app for {asset.name}</p>
          <p className="text-xs text-muted-foreground">
            A plain JSON-RPC node can’t list an address’s transactions, and we deliberately don’t add a
            third-party indexer (a new data source &amp; phone-home surface). Per-tx fees are on the block explorer.
          </p>
          {address && (
            <a href={explorerAddressUrl(asset, address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              View {short(address)} on {source?.networkName} explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Live mode, locked wallet: indeterminate, NOT zero fees. */}
      {lockedLive && !isLoading && (
        <div className="p-8 text-center rounded-xl border border-dashed border-border space-y-2">
          <Lock className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Wallet locked</p>
          <p className="text-xs text-muted-foreground">Unlock your wallet to derive your {asset.symbol} address and compute its fees.</p>
        </div>
      )}

      {/* Available view */}
      {!isLoading && !isError && analytics?.available && !lockedLive && (
        <>
          {analytics.paidTxCount === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border space-y-1">
              <Fuel className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium text-foreground">No fees paid yet</p>
              <p className="text-xs">
                {isErc20Empty
                  ? `${asset.symbol} transfers pay gas in the native coin — those fees appear under ETH, not ${asset.symbol}.`
                  : `Fees you pay sending ${asset.symbol} on ${source?.networkName} will be totalled here.`}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total fees paid" value={analytics.totalFeeNative} symbol={analytics.assetSymbol} />
                <StatCard label="Transactions" value={String(analytics.paidTxCount)} mono={false} />
                <StatCard label="Average fee" value={analytics.avgFeeNative} symbol={analytics.assetSymbol} />
                <StatCard label="Highest fee" value={analytics.maxFeeNative} symbol={analytics.assetSymbol} />
              </div>

              {/* I4 honesty: paid txs whose fee the indexer didn't report. */}
              {analytics.unknownFeeCount > 0 && (
                <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 text-caution shrink-0 mt-0.5" />
                  <p>
                    {analytics.unknownFeeCount} paid transaction{analytics.unknownFeeCount !== 1 ? "s" : ""} had no
                    fee reported by the indexer and {analytics.unknownFeeCount !== 1 ? "are" : "is"} excluded from the
                    total — shown as unknown rather than guessed.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold">Fees paid ({analytics.paidTxCount})</p>
                {analytics.perTx.map((tx) => (
                  <FeeRow key={tx.id} tx={tx} symbol={analytics.assetSymbol} />
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end text-xs text-muted-foreground">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground disabled:opacity-50"
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fuel className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
}
