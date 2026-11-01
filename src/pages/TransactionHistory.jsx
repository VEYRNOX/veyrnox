// @ts-nocheck
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { formatUnits } from "ethers";
import {
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Clock, CheckCircle2, XCircle,
  ExternalLink, Loader2, AlertTriangle, Lock, ShieldCheck, History, Info, Printer,
} from "lucide-react";
import { DEMO } from "@/api/demoClient";
import { base44 } from "@/api/base44Client";
import { SkeletonList } from "@/components/Skeleton";
import { ALLOW_MAINNET, getNetworkInfo } from "@/wallet-core/evm/networks";
import { useWallet } from "@/lib/WalletProvider";
import { ASSETS, canReceive } from "@/wallet-core/assets";
import { fetchAssetHistory, explorerAddressUrl } from "@/lib/txHistory";
import { isDeniabilitySessionActive, isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";
import { useActionGuard } from "@/components/security/useActionGuard";
import { toast } from "@/lib/toast";
import { getAuthModel } from "@/lib/authModel";
import {
  preparePendingEvmReplacement,
  replacePendingEvmTransaction,
  REPLACEMENT_ACTION,
} from "@/wallet-core/evm/replacement";

// Only assets that derive a real address can have an address to look up. The
// history view mirrors the wallet's receivable assets (coming_soon assets have no
// address). ETH is first/default.
const HISTORY_ASSETS = ASSETS.filter((a) => canReceive(a));

const statusMeta = {
  pending: { icon: Clock, cls: "text-caution", label: "Pending" },
  confirmed: { icon: CheckCircle2, cls: "text-primary", label: "Confirmed" },
  failed: { icon: XCircle, cls: "text-destructive", label: "Failed" },
  replaced: { icon: ArrowLeftRight, cls: "text-muted-foreground", label: "Replaced" },
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
            <span className="text-xs px-1 py-0.5 rounded bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">{t("tx.history.sample_badge")}</span>
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
        <p className="text-xs text-muted-foreground">
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
function TxDetailDialog({ tx, open, onClose, canReplace, onReplace, replacementPreparing }) {
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
          <p className="text-center text-muted-foreground text-xs">
            Digital transaction record — verify on the block explorer.
          </p>
          {canReplace && (
            <div className="grid grid-cols-2 gap-2 pt-2 font-sans">
              <Button
                type="button"
                variant="outline"
                disabled={replacementPreparing}
                onClick={() => onReplace(tx, REPLACEMENT_ACTION.SPEED_UP)}
              >
                {replacementPreparing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : "Speed up"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={replacementPreparing}
                onClick={() => onReplace(tx, REPLACEMENT_ACTION.CANCEL)}
              >
                Cancel transaction
              </Button>
            </div>
          )}
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
function normalizeLocalSend(row, asset) {
  if (!row || !row.tx_hash) return null;
  if ((row.currency || "").toUpperCase() !== asset.symbol.toUpperCase()) return null;
  const ts = row.updated_date || row.created_date;
  return {
    id: row.tx_hash,
    localId: row.id || null,
    walletId: row.wallet_id || null,
    hash: row.tx_hash,
    family: asset.family,
    networkKey: row.network || asset.chain,
    assetSymbol: asset.symbol,
    type: row.type || "send",
    status: row.status || "pending",
    amount: String(row.amount ?? ""),
    feeNative: row.fee != null ? String(row.fee) : null,
    feePaidByUs: (row.type || "send") === "send",
    counterparty: row.to_address || row.from_address || null,
    fromAddress: row.from_address || null,
    timestamp: ts ? new Date(ts).getTime() : null,
    explorerUrl: row.explorer_url || "",
    demo: false,
  };
}

export default function TransactionHistory() {
  const { t } = useTranslation("wallet");
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { requireTwoFactor, gateModal } = useActionGuard();
  const egressAllowed = !isDeniabilityOrDemoActive();
  const [symbol, setSymbol] = useState("ETH");
  const [replacementReview, setReplacementReview] = useState(null);
  const [replacementError, setReplacementError] = useState("");
  const [replacementCredential, setReplacementCredential] = useState("");
  const [replacementNeedsReauth, setReplacementNeedsReauth] = useState(false);
  const [replacementVerifying, setReplacementVerifying] = useState(false);
  const [selected, setSelected] = useState(null);
  const replacementInFlightRef = useRef(false);
  const authModel = getAuthModel();
  const asset = useMemo(() => HISTORY_ASSETS.find((a) => a.symbol === symbol) || HISTORY_ASSETS[0], [symbol]);
  const address = DEMO ? null : addressFor(asset, wallet);

  const safeReplacementError = (err) => {
    const messages = {
      ORIGINAL_TX_UNAVAILABLE: "The pending transaction is no longer available. Refresh activity and try again.",
      ORIGINAL_TX_CONFIRMED: "The original transaction has already confirmed, so it cannot be replaced.",
      ORIGINAL_NONCE_GONE: "The original nonce is no longer pending. Refresh activity before trying again.",
      STEP_UP_REQUIRED: "Re-enter your PIN or password before signing.",
      PRESIGN_BLOCKED: "The pre-sign safety check blocked this transaction. Nothing was signed.",
      REPLACEMENT_EIP1559_REQUIRED: "This pending transaction does not use EIP-1559 fees and cannot be replaced here.",
      REPLACEMENT_REVIEW_CHANGED: "The transaction changed while you were reviewing it. Review the new fee again.",
    };
    return messages[err?.code] || "The replacement could not be completed safely. Nothing was signed.";
  };

  const prepareReplacement = useMutation({
    mutationFn: async ({ tx, action }) => {
      if (DEMO || isDeniabilityOrDemoActive()) {
        throw Object.assign(new Error("Replacement unavailable"), { code: "REPLACEMENT_UNAVAILABLE" });
      }
      const from = tx.fromAddress || address;
      return {
        target: tx,
        prepared: await preparePendingEvmReplacement({
          networkKey: tx.networkKey || asset.chain,
          originalHash: tx.hash,
          expectedFrom: from,
          action,
        }),
      };
    },
    onSuccess: (review) => {
      setSelected(null);
      setReplacementError("");
      setReplacementCredential("");
      setReplacementNeedsReauth(false);
      setReplacementReview(review);
    },
    onError: (err) => {
      const message = safeReplacementError(err);
      setReplacementError(message);
      toast.error(message);
    },
  });

  const broadcastReplacement = useMutation({
    mutationFn: async ({ target, prepared }) => {
      if (replacementInFlightRef.current) {
        throw Object.assign(new Error("Replacement already in progress"), { code: "REPLACEMENT_IN_FLIGHT" });
      }
      replacementInFlightRef.current = true;
      const account = wallet.accounts?.find((a) =>
        a.address?.toLowerCase() === prepared.from.toLowerCase()
      );
      if (!account) {
        throw Object.assign(new Error("Active account mismatch"), { code: "REPLACEMENT_KEY_MISMATCH" });
      }
      return replacePendingEvmTransaction({
        prepared,
        isReauthRequired: wallet.isSendReauthRequired,
        withPrivateKey: (signer) => wallet.withPrivateKey(account.index, signer),
      }).then((result) => ({ result, target }));
    },
    onSuccess: async ({ result, target }) => {
      // The broadcast has already happened. Local-history persistence is
      // best-effort so a storage error cannot invite a duplicate replacement.
      try {
        if (target.localId) {
          await base44.entities.Transaction.update(target.localId, { status: "replaced" });
        }
        await base44.entities.Transaction.create({
          wallet_id: target.walletId || wallet.activeWalletId,
          type: result.action === REPLACEMENT_ACTION.CANCEL ? "self" : (target.type || "send"),
          amount: result.action === REPLACEMENT_ACTION.CANCEL ? 0 : target.amount,
          currency: target.assetSymbol,
          to_address: result.action === REPLACEMENT_ACTION.CANCEL ? result.from : target.counterparty,
          from_address: result.from,
          network: target.networkKey,
          status: "pending",
          tx_hash: result.hash,
          explorer_url: result.explorerUrl,
          replaces_tx_hash: target.hash,
          replacement_action: result.action,
        });
      } catch {
        toast.warning("Replacement broadcast, but local activity could not be updated. Refresh before trying again.");
      }
      queryClient.invalidateQueries({ queryKey: ["local-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setReplacementReview(null);
      setReplacementError("");
      toast.success(result.action === REPLACEMENT_ACTION.CANCEL
        ? "Cancellation broadcast. It remains pending until the network includes it."
        : "Speed-up broadcast. It remains pending until the network includes it.");
    },
    onError: (err) => {
      if (err?.code !== "REPLACEMENT_IN_FLIGHT") setReplacementError(safeReplacementError(err));
    },
    onSettled: (_data, err) => {
      if (err?.code !== "REPLACEMENT_IN_FLIGHT") replacementInFlightRef.current = false;
    },
  });

  const runReviewedReplacement = () => {
    if (!replacementReview || broadcastReplacement.isPending) return;
    requireTwoFactor(
      () => broadcastReplacement.mutate(replacementReview),
      { title: replacementReview.prepared.action === REPLACEMENT_ACTION.CANCEL
        ? "Authorise transaction cancellation"
        : "Authorise transaction speed-up" },
    );
  };

  const authoriseReplacement = () => {
    setReplacementError("");
    let needsReauth = true;
    try {
      needsReauth = typeof wallet.isSendReauthRequired === "function"
        ? wallet.isSendReauthRequired()
        : true;
    } catch {
      needsReauth = true;
    }
    if (needsReauth !== false) {
      setReplacementNeedsReauth(true);
      return;
    }
    runReviewedReplacement();
  };

  const submitReplacementReauth = async () => {
    if (!replacementCredential || replacementVerifying) return;
    setReplacementVerifying(true);
    setReplacementError("");
    try {
      if (typeof wallet.verifyActiveCredentialDetailed !== "function") {
        setReplacementError("Verification is unavailable. Re-lock and unlock your wallet before trying again.");
        return;
      }
      const result = await wallet.verifyActiveCredentialDetailed(replacementCredential);
      if (result?.bricked) {
        setReplacementError("Verification is unavailable. Re-lock and unlock your wallet before trying again.");
        return;
      }
      if (result?.ok !== true) {
        setReplacementError("That PIN or password was not accepted.");
        return;
      }
      setReplacementCredential("");
      setReplacementNeedsReauth(false);
      runReviewedReplacement();
    } catch {
      setReplacementError("Verification is unavailable. Re-lock and unlock your wallet before trying again.");
    } finally {
      setReplacementVerifying(false);
    }
  };

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
  // MNY-03: `error.message` for a Solana history failure is the raw upstream
  // JSON-RPC error body (HTTP code + full JSON, including a request id) --
  // never safe to render (see the sanitisation comment on error_prefix
  // below, and CandlestickChart.jsx's identical "raw provider errors must
  // never render" rule). Keep the real detail available for debugging, but
  // DEV-only -- same pattern as WalletEntry.jsx / tipScreen.js.
  if (import.meta.env.DEV && isError && error) {
    console.error('[TransactionHistory] history fetch failed:', error);
  }

  // Locally-stored sends (Transaction entity, on-device IndexedDB). Read-only,
  // gated on the same deniability flag as the chain fetch — a decoy session
  // must never render real-session tx rows even from local cache.
  const { data: localRowsRaw = [] } = useQuery({
    queryKey: ["local-transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 200),
    enabled: !isDeniabilitySessionActive(),
    staleTime: 5000,
  });
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
      .map((r) => normalizeLocalSend(r, asset))
      .filter(Boolean);
    const byHash = new Map();
    for (const row of localNormalized) byHash.set(row.hash, row);
    for (const row of chainTxs) if (row.hash) byHash.set(row.hash, row); // chain wins
    return Array.from(byHash.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [denySession, localRowsRaw, chainTxs, asset]);

  useAdvisorSnapshot({
    transaction_history: {
      selected_asset: asset.symbol,
      loading: isLoading,
      error: isError,
      tx_count: txs.length,
    },
  });

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
        <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? t("tx.history.badge_demo") : ALLOW_MAINNET ? t("tx.history.badge_mainnet") : t("tx.history.badge_testnet")}
        </span>
      </div>

      {/* Asset selector */}
      <div className="flex gap-2 flex-wrap">
        {HISTORY_ASSETS.map((a) => (
          <button
            key={a.symbol}
            onClick={() => setSymbol(a.symbol)}
            className={`px-3 min-h-[44px] inline-flex items-center justify-center rounded-lg text-xs font-semibold border transition-colors ${
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
              {/* MNY-03: never interpolate the raw error.message -- for Solana
                  it's the upstream JSON-RPC error body verbatim (HTTP code +
                  full JSON + a request uuid). Route through the two sanctioned,
                  client-safe reasons only; the real detail is DEV-logged above. */}
              <span>{t("tx.history.error_prefix", { reason: error?.message?.toLowerCase().includes("fetch") ? t("tx.history.error_fetch_reason") : t("tx.history.error_generic_reason") })}</span>
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground pt-1">
                Your sends (stored on-device)
              </p>
            )}
            {txs.map((tx) => <TxRow key={tx.id} tx={tx} onOpen={setSelected} />)}
          </>
        )}
      </div>

      <TxDetailDialog
        tx={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        canReplace={!!selected
          && selected.status === "pending"
          && (selected.family === "evm" || selected.family === "erc20")
          && (selected.type === "send" || selected.type === "self")
          && !DEMO
          && !denySession}
        onReplace={(tx, action) => {
          setReplacementError("");
          prepareReplacement.mutate({ tx, action });
        }}
        replacementPreparing={prepareReplacement.isPending}
      />

      <Dialog
        open={!!replacementReview}
        onOpenChange={(open) => {
          if (!open && !broadcastReplacement.isPending) {
            setReplacementReview(null);
            setReplacementError("");
            setReplacementCredential("");
            setReplacementNeedsReauth(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {replacementReview?.prepared.action === REPLACEMENT_ACTION.CANCEL
                ? "Cancel pending transaction"
                : "Speed up pending transaction"}
            </DialogTitle>
          </DialogHeader>
          {replacementReview && (() => {
            const { prepared } = replacementReview;
            const network = getNetworkInfo(prepared.networkKey);
            const symbol = network?.symbol || "native token";
            const maxFee = formatUnits(prepared.maxNetworkFeeWei, network?.decimals ?? 18);
            const oldMax = formatUnits(prepared.originalMaxFeePerGas, "gwei");
            const newMax = formatUnits(prepared.txRequest.maxFeePerGas, "gwei");
            const oldPriority = formatUnits(prepared.originalMaxPriorityFeePerGas, "gwei");
            const newPriority = formatUnits(prepared.txRequest.maxPriorityFeePerGas, "gwei");
            return (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  {prepared.action === REPLACEMENT_ACTION.CANCEL
                    ? "This sends 0 to your own address with the same nonce. If the network accepts it first, the original transaction will not execute."
                    : "This sends the same transaction again with the same nonce and higher fees. Only one version can confirm."}
                </p>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Maximum network fee</span>
                    <span className="font-semibold text-end">{maxFee} {symbol}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This is the most the replacement can cost, not an estimate. The actual fee may be lower.
                  </p>
                  <div className="border-t border-border pt-2 text-xs space-y-1">
                    <div className="flex justify-between gap-3">
                      <span>Fee cap</span><span>{oldMax} → {newMax} gwei</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Priority fee</span><span>{oldPriority} → {newPriority} gwei</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Both fee rates are raised by at least 10%, rounded up to whole wei, to meet the usual node replacement rule.
                  </p>
                </div>

                {replacementNeedsReauth && (
                  <div className="space-y-2">
                    <label htmlFor="replacement-credential" className="text-xs font-medium">
                      Re-enter your {authModel === "pin" ? "PIN" : "password"} to authorise signing
                    </label>
                    <Input
                      id="replacement-credential"
                      type="password"
                      inputMode={authModel === "pin" ? "numeric" : "text"}
                      autoComplete="current-password"
                      value={replacementCredential}
                      disabled={replacementVerifying || broadcastReplacement.isPending}
                      onChange={(event) => setReplacementCredential(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submitReplacementReauth();
                      }}
                    />
                  </div>
                )}

                {replacementError && <p role="alert" className="text-sm text-destructive">{replacementError}</p>}

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={broadcastReplacement.isPending}
                    onClick={() => setReplacementReview(null)}
                  >
                    Keep pending
                  </Button>
                  <Button
                    type="button"
                    variant={prepared.action === REPLACEMENT_ACTION.CANCEL ? "destructive" : "default"}
                    disabled={broadcastReplacement.isPending || replacementVerifying || (replacementNeedsReauth && !replacementCredential)}
                    onClick={() => replacementNeedsReauth ? void submitReplacementReauth() : authoriseReplacement()}
                  >
                    {(broadcastReplacement.isPending || replacementVerifying) && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />}
                    {replacementNeedsReauth
                      ? "Verify and continue"
                      : prepared.action === REPLACEMENT_ACTION.CANCEL ? "Sign cancellation" : "Sign speed-up"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {gateModal}

      {/* Footer: count + manual refresh (keeps the disclosure on-demand, not auto). */}
      {data?.supported && !evmNoIndexer && !lockedLive && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("tx.history.count", { count: txs.length })}{!DEMO && t("tx.history.most_recent_suffix")}</span>
          {egressAllowed && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mx-2 font-semibold hover:text-foreground disabled:opacity-50"
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
