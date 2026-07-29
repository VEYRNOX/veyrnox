// @ts-nocheck
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Clock, CheckCircle2, XCircle,
  ExternalLink, Loader2, AlertTriangle, Lock, ShieldCheck, History, Info,
} from "lucide-react";
import { DEMO } from "@/api/demoClient";
import { SkeletonList } from "@/components/Skeleton";
import { ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS, canReceive } from "@/wallet-core/assets";
import { fetchAssetHistory, explorerAddressUrl } from "@/lib/txHistory";
import { isDeniabilitySessionActive, isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

// Only assets that derive a real address can have an address to look up. The
// history view mirrors the wallet's receivable assets (coming_soon assets have no
// address). ETH is first/default.
const HISTORY_ASSETS = ASSETS.filter((a) => canReceive(a));

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

function TxRow({ tx }) {
  const { t } = useTranslation("wallet");
  const sMeta = statusMeta[tx.status] || statusMeta.confirmed;
  const StatusIcon = sMeta.icon;
  const isSend = tx.type === "send";
  const isSelf = tx.type === "self";
  const DirIcon = isSelf ? ArrowLeftRight : isSend ? ArrowUpRight : ArrowDownLeft;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-colors">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
        isSelf ? "bg-secondary" : isSend ? "bg-destructive/10" : "bg-primary/10"
      }`}>
        <DirIcon className={`h-4 w-4 ${isSelf ? "text-muted-foreground" : isSend ? "text-destructive" : "text-primary"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium capitalize">{tx.type}</p>
          <StatusIcon className={`h-3.5 w-3.5 ${sMeta.cls}`} />
          {tx.demo && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">{t("tx.history.sample_badge")}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate font-mono">
          {isSend ? t("tx.history.to_prefix") : isSelf ? "" : t("tx.history.from_prefix")}{short(tx.counterparty) || "—"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${isSelf ? "text-foreground" : isSend ? "text-destructive" : "text-primary"}`}>
          {isSelf ? "" : isSend ? "-" : "+"}{tx.amount} {tx.assetSymbol}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {tx.timestamp ? formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true }) : t("tx.history.awaiting_confirmation")}
        </p>
      </div>
      {tx.explorerUrl && (
        <a
          href={tx.explorerUrl}
          target="_blank"
          rel="noreferrer"
          title={t("tx.history.view_explorer_title")}
          className="shrink-0 p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function TransactionHistory() {
  const { t } = useTranslation("wallet");
  const wallet = useWallet();
  const egressAllowed = !isDeniabilityOrDemoActive();
  const [symbol, setSymbol] = useState("ETH");
  const asset = useMemo(() => HISTORY_ASSETS.find((a) => a.symbol === symbol) || HISTORY_ASSETS[0], [symbol]);
  const address = DEMO ? null : addressFor(asset, wallet);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["tx-history", asset.symbol, address, DEMO],
    queryFn: () => fetchAssetHistory({ asset, address, demo: DEMO }),
    // I3 zero-egress: never attempt the address->indexer disclosure in a
    // deniability (decoy/hidden) session — disable the query entirely.
    enabled: !isDeniabilitySessionActive(),
    // History is a snapshot the user explicitly opens; don't auto-refetch in the
    // background (that would repeat the address->indexer disclosure silently).
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: 1,
  });

  const source = data?.source;
  const txs = data?.transactions || [];
  const lockedLive = !DEMO && data?.reason === "locked";
  const evmNoIndexer = data?.supported === false && data?.reason === "evm-no-indexer";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> {t("tx.history.heading")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("tx.history.subhead")}
          </p>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? t("tx.history.badge_demo") : ALLOW_MAINNET ? t("tx.history.badge_mainnet") : t("tx.history.badge_testnet")}
        </span>
      </div>

      {/* Asset selector */}
      <div className="flex gap-2 flex-wrap">
        {HISTORY_ASSETS.map((a) => (
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

      {/* Privacy / data-source disclosure — honest per-chain phone-home note. */}
      {source && (
        <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold text-foreground">{source.networkName}</span>
            {" · "}
            {DEMO
              ? t("tx.history.privacy_demo_note")
              : source.privacyNote}
          </p>
        </div>
      )}

      {/* States */}
      <div className="space-y-2">
        {isLoading && (
          <div className="py-2" role="status" aria-live="polite" aria-label={t("tx.history.loading_label", { symbol: asset.symbol })}>
            <SkeletonList rows={5} />
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t("tx.history.error_prefix", { reason: error?.message?.toLowerCase().includes("fetch") ? t("tx.history.error_fetch_reason") : (error?.message || t("tx.history.error_generic_reason")) })}</span>
            </div>
            {egressAllowed && (
              <button
                onClick={() => refetch()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:border-primary"
              >
                {t("tx.history.retry")}
              </button>
            )}
          </div>
        )}

        {/* EVM: no JSON-RPC history method — explorer fallback (the private choice). */}
        {evmNoIndexer && !isLoading && (
          <div className="p-5 rounded-xl border border-dashed border-border bg-card/50 space-y-3 text-center">
            <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
            <p className="text-sm font-medium">{t("tx.history.no_indexer_title", { name: asset.name })}</p>
            <p className="text-xs text-muted-foreground">
              {t("tx.history.no_indexer_body")}
            </p>
            {address && (
              <a
                href={explorerAddressUrl(asset, address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {t("tx.history.view_on_explorer", { address: short(address), network: source?.networkName })} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {!address && (
              <p className="text-xs text-muted-foreground">{t("tx.history.unlock_for_explorer", { symbol: asset.symbol })}</p>
            )}
          </div>
        )}

        {/* Live mode, locked wallet: no address derived yet. */}
        {lockedLive && !isLoading && (
          <div className="p-8 text-center rounded-xl border border-dashed border-border space-y-2">
            <Lock className="h-6 w-6 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">{t("tx.history.locked_title")}</p>
            <p className="text-xs text-muted-foreground">{t("tx.history.locked_body", { symbol: asset.symbol })}</p>
          </div>
        )}

        {/* Empty (supported + address, but no txs) */}
        {!isLoading && !isError && data?.supported && !evmNoIndexer && !lockedLive && txs.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">
            {t("tx.history.empty", { symbol: asset.symbol, network: source?.networkName })}
          </div>
        )}

        {/* Data */}
        {!isLoading && txs.map((tx) => <TxRow key={tx.id} tx={tx} />)}
      </div>

      {/* Footer: count + manual refresh (keeps the disclosure on-demand, not auto). */}
      {data?.supported && !evmNoIndexer && !lockedLive && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("tx.history.count", { count: txs.length })}{!DEMO && t("tx.history.most_recent_suffix")}</span>
          {egressAllowed && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground disabled:opacity-50"
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <History className="h-3.5 w-3.5" />}
              {t("tx.history.refresh")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
