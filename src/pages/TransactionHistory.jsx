// @ts-nocheck
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Clock, CheckCircle2, XCircle,
  ExternalLink, Loader2, AlertTriangle, Lock, ShieldCheck, History, Info, Printer,
} from "lucide-react";
import { DEMO } from "@/api/demoClient";
import { base44 } from "@/api/base44Client";
import { SkeletonList } from "@/components/Skeleton";
import { ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS, canReceive } from "@/wallet-core/assets";
import { fetchAssetHistory, explorerAddressUrl } from "@/lib/txHistory";
import { isDeniabilitySessionActive, isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Only assets that derive a real address can have an address to look up. The
// history view mirrors the wallet's receivable assets (coming_soon assets have no
// address). ETH is first/default.
const HISTORY_ASSETS = ASSETS.filter((a) => canReceive(a));

const statusMeta = {
  pending: { icon: Clock, cls: "text-caution", label: "Pending" },
  confirmed: { icon: CheckCircle2, cls: "text-primary", label: "Confirmed" },
  failed: { icon: XCircle, cls: "text-destructive", label: "Failed" },
  // Codex P2 2026-08-15: fallback for unknown / missing tx.status. Prior
  // behaviour fell open to "Confirmed" via `statusMeta[tx.status] || statusMeta.confirmed`,
  // so a poisoned/stale indexer row with no trustworthy status could show
  // green-check + "Confirmed" to the user. Now: unknown → neutral clock icon
  // + "Unknown". Reader can see the row exists but must not treat it as
  // confirmed money.
  unknown: { icon: AlertTriangle, cls: "text-muted-foreground", label: "Unknown" },
};

const short = (a) => (a && a.length > 16 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a || "—");

// Resolve the derived address for the selected asset's family from the unlocked
// wallet. In demo mode this is unused (demo history is local sample data).
function addressFor(asset, wallet) {
  if (asset.family === "btc") return wallet.btcAccount?.address || null;
  if (asset.family === "solana") return wallet.solAccount?.address || null;
  return wallet.accounts?.[0]?.address || null; // evm / erc20 share one address
}

function TxRow({ tx, onOpen }) {
  const { t } = useTranslation("wallet");
  const sMeta = statusMeta[tx.status] || statusMeta.unknown;
  const StatusIcon = sMeta.icon;
  const isSend = tx.type === "send";
  const isSelf = tx.type === "self";
  const DirIcon = isSelf ? ArrowLeftRight : isSend ? ArrowUpRight : ArrowDownLeft;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(tx)}
      className="w-full text-start flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none transition-colors"
    >
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
      <div className="text-end shrink-0">
        <p className={`text-sm font-semibold ${isSelf ? "text-foreground" : isSend ? "text-destructive" : "text-primary"}`}>
          {isSelf ? "" : isSend ? "-" : "+"}{tx.amount} {tx.assetSymbol}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {tx.timestamp ? formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true }) : t("tx.history.awaiting_confirmation")}
        </p>
      </div>
    </button>
  );
}

// Detail drawer: full receipt for one tx. Shows REAL on-chain hash (not an
// internal UUID), hyperlinks it to the explorer for that asset's chain, and
// exposes a print button that emits a text-only receipt via a fresh window.
// Print DOM built with textContent only — never innerHTML with user-derived
// strings (VULN-3 rule preserved from the removed TransactionReceipt page).
function TxDetailDialog({ tx, open, onClose }) {
  const { t } = useTranslation("wallet");
  if (!tx) return null;
  const sMeta = statusMeta[tx.status] || statusMeta.unknown;
  const isSend = tx.type === "send";
  const feeLine = tx.feeNative && tx.feePaidByUs
    ? `${tx.feeNative} ${tx.assetSymbol}`
    : "—";
  const dateStr = tx.timestamp
    ? new Date(tx.timestamp).toLocaleString(undefined)
    : t("tx.history.awaiting_confirmation");
  const rows = [
    ["Type", (tx.type || "").toUpperCase()],
    ["Status", (sMeta.label || tx.status || "").toUpperCase()],
    ["Asset", tx.assetSymbol],
    ["Amount", `${isSend ? "-" : "+"}${tx.amount} ${tx.assetSymbol}`],
    ["Network Fee", feeLine],
    [isSend ? "To" : "From", tx.counterparty || "—"],
    ["Date", dateStr],
    ["Tx Hash", tx.hash || "—"],
  ];

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const doc = win.document;
    doc.open();
    doc.write(`<html><head><title>VEYRNOX Transaction Receipt</title><style>
      body{font-family:monospace;padding:32px;max-width:520px;margin:auto;color:#111;}
      h2{text-align:center;margin-bottom:8px;}
      .sub{text-align:center;color:#666;margin-bottom:16px;font-size:12px;}
      .div{border-top:1px dashed #ccc;margin:12px 0;}
      .row{display:flex;justify-content:space-between;gap:12px;margin:6px 0;font-size:12px;}
      .label{color:#666;} .value{font-weight:600;word-break:break-all;text-align:right;}
      .foot{text-align:center;color:#666;font-size:10px;}
    </style></head><body></body></html>`);
    doc.close();
    const h2 = doc.createElement("h2"); h2.textContent = "VEYRNOX"; doc.body.appendChild(h2);
    const sub = doc.createElement("p"); sub.className = "sub"; sub.textContent = "TRANSACTION RECEIPT"; doc.body.appendChild(sub);
    const d1 = doc.createElement("div"); d1.className = "div"; doc.body.appendChild(d1);
    rows.forEach(([k, v]) => {
      const r = doc.createElement("div"); r.className = "row";
      const l = doc.createElement("span"); l.className = "label"; l.textContent = k;
      const val = doc.createElement("span"); val.className = "value"; val.textContent = String(v);
      r.appendChild(l); r.appendChild(val); doc.body.appendChild(r);
    });
    if (tx.explorerUrl) {
      const r = doc.createElement("div"); r.className = "row";
      const l = doc.createElement("span"); l.className = "label"; l.textContent = "Explorer";
      const val = doc.createElement("span"); val.className = "value"; val.textContent = tx.explorerUrl;
      r.appendChild(l); r.appendChild(val); doc.body.appendChild(r);
    }
    const d2 = doc.createElement("div"); d2.className = "div"; doc.body.appendChild(d2);
    const foot = doc.createElement("p"); foot.className = "foot";
    foot.textContent = "Digital transaction record — verify on block explorer.";
    doc.body.appendChild(foot);
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Transaction Receipt</span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 text-xs">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="font-mono text-xs space-y-1">
          <div className="border-t border-dashed border-border my-2" />
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-0.5">
              <span className="text-muted-foreground shrink-0">{k}</span>
              <span className="font-semibold break-all text-end mono-value">{v}</span>
            </div>
          ))}
          {tx.explorerUrl && (
            <div className="flex justify-between gap-3 py-0.5 items-center">
              <span className="text-muted-foreground shrink-0">Explorer</span>
              <a
                href={tx.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline break-all text-end"
              >
                View on chain <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}
          <div className="border-t border-dashed border-border my-2" />
          <p className="text-center text-muted-foreground text-[10px]">
            Digital transaction record — verify on the block explorer.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Coerce a locally-stored Transaction row (from base44 Transaction entity —
// only sends land here today, via SendCrypto's Transaction.create) into the
// same normalized shape chain history uses, so both sources merge cleanly.
// Chain rows win on dedup because they carry authoritative confirmed/failed
// status. EVM has no in-app history indexer (see txHistory.js), so this local
// mirror is the ONLY way an EVM send shows up here with a receipt.
function normalizeLocalSend(row, assetSymbol) {
  if (!row || !row.tx_hash) return null;
  if ((row.currency || "").toUpperCase() !== assetSymbol.toUpperCase()) return null;
  const ts = row.updated_date || row.created_date;
  return {
    id: row.tx_hash,
    hash: row.tx_hash,
    family: null,
    networkKey: null,
    assetSymbol,
    type: row.type || "send",
    status: row.status || "pending",
    amount: String(row.amount ?? ""),
    feeNative: row.fee != null ? String(row.fee) : null,
    feePaidByUs: (row.type || "send") === "send",
    counterparty: row.to_address || row.from_address || null,
    timestamp: ts ? new Date(ts).getTime() : null,
    explorerUrl: row.explorer_url || "",
    demo: false,
  };
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

  // Locally-stored sends (Transaction entity, on-device IndexedDB). Read-only,
  // gated on the same deniability flag as the chain fetch — a decoy session
  // must never render real-session tx rows even from local cache.
  const { data: localRowsRaw = [] } = useQuery({
    queryKey: ["local-transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 200),
    enabled: !isDeniabilitySessionActive(),
    staleTime: 5000,
  });
  const [selected, setSelected] = useState(null);

  // Codex P1 2026-08-15: `enabled:false` stops refetches, NOT cached reads.
  // A real-session cache under the same queryKey would still render into a
  // decoy/hidden session on mount. Blank the derived shape so the neutral
  // "no history" state renders even if a stale cache exists. Same defence
  // repeated in TransactionReceipt + LoginActivity in this wave.
  const denySession = isDeniabilitySessionActive();
  const source = denySession ? undefined : data?.source;
  const chainTxs = denySession ? [] : (data?.transactions || []);
  const lockedLive = !DEMO && !denySession && data?.reason === "locked";
  const evmNoIndexer = data?.supported === false && data?.reason === "evm-no-indexer";

  // Merge local sends into the list (deduped by hash — chain-derived rows win
  // because they carry authoritative status). Local sends are the ONLY way an
  // EVM send appears here today, and they also cover the pending window before
  // an indexer catches up on BTC/SOL. Sorted newest-first by timestamp.
  const txs = useMemo(() => {
    if (denySession) return [];
    const localNormalized = localRowsRaw
      .map((r) => normalizeLocalSend(r, asset.symbol))
      .filter(Boolean);
    const byHash = new Map();
    for (const row of localNormalized) byHash.set(row.hash, row);
    for (const row of chainTxs) if (row.hash) byHash.set(row.hash, row); // chain wins
    return Array.from(byHash.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [denySession, localRowsRaw, chainTxs, asset.symbol]);

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

        {/* Data — clicking a row opens the receipt detail (real tx_hash + explorer link + print).
            Includes chain-fetched history (BTC/SOL) merged with local on-device sends (all
            chains, including EVM — the only in-app source for EVM history). Dedup by hash. */}
        {!isLoading && txs.length > 0 && (
          <>
            {evmNoIndexer && (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">
                Your sends (stored on-device)
              </p>
            )}
            {txs.map((tx) => <TxRow key={tx.id} tx={tx} onOpen={setSelected} />)}
          </>
        )}
      </div>

      <TxDetailDialog tx={selected} open={!!selected} onClose={() => setSelected(null)} />

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
