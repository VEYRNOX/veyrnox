// components/TransactionPreview.jsx
//
// Pre-sign Transaction Simulation preview (Phase S2). Presentational ONLY: it
// renders a result object produced by the wallet-core simulators
// (evm/simulate.js, btc/simulate.js, sol/simulate.js) — it holds no keys, makes
// no network calls, and decides nothing. The page wires the data in.
//
// PRINCIPLES (mirrored from the simulators):
//   - WARN, never block. We surface findings; the user still chooses.
//   - NEVER assert "safe". With no findings we say "no KNOWN risks detected —
//     this is not a guarantee of safety", never "this is safe".
//   - Local-first: the footer states the data source (the user's own RPC) and
//     that nothing was sent to a third party.

import {
  Activity, ArrowDownLeft, ArrowUpRight, AlertTriangle, ShieldAlert,
  Info, Loader2, Fuel, ServerCog, CheckCircle2,
} from "lucide-react";

const LEVEL_STYLES = {
  high:   { box: "bg-destructive/10 border-destructive/40", text: "text-destructive", Icon: ShieldAlert },
  medium: { box: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-300", Icon: AlertTriangle },
  info:   { box: "bg-secondary/40 border-border", text: "text-muted-foreground", Icon: Info },
};

function shorten(addr) {
  if (!addr || typeof addr !== "string") return addr;
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function RiskRow({ risk }) {
  const s = LEVEL_STYLES[risk.level] || LEVEL_STYLES.info;
  const { Icon } = s;
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${s.box}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${s.text}`} />
      <div className={`text-xs space-y-0.5 min-w-0 ${s.text}`}>
        <p className="font-semibold">{risk.title}</p>
        <p className="opacity-90">{risk.detail}</p>
      </div>
    </div>
  );
}

export default function TransactionPreview({ result, loading, error }) {
  if (loading) {
    return (
      <div className="p-3 rounded-lg bg-secondary/30 border border-border flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Simulating against your RPC…
      </div>
    );
  }

  if (error && !result) {
    // Degrade, never block — a simulation we couldn't run is not a green light.
    return (
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2 text-xs text-yellow-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Couldn't simulate this transaction (your RPC was unreachable). This is not a green light — review the recipient, amount and contract yourself before signing.</span>
      </div>
    );
  }

  if (!result) return null;

  const risks = result.risks || [];
  const actionable = risks.filter((r) => r.level !== "info");
  const infos = risks.filter((r) => r.level === "info");
  const noKnownRisks = actionable.length === 0 && !result.willRevert;

  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-3">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest flex items-center gap-1.5">
        <Activity className="h-3 w-3" />
        {result.simulated ? "Transaction simulation" : "Decoded transaction"}
      </p>

      {/* Predicted FAILURE leads everything — most actionable single fact. */}
      {result.willRevert && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/40 text-xs text-destructive">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold">Transaction predicted to FAIL</p>
            <p className="opacity-90 break-words">
              Simulated against your RPC, this reverts{result.revertReason ? `: ${result.revertReason}` : ""}. Signing would spend gas for nothing.
            </p>
          </div>
        </div>
      )}

      {/* Predicted balance changes — "you send X, recipient receives Y". */}
      {result.balanceChanges?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Predicted balance changes</p>
          {result.balanceChanges.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                {c.direction === "out"
                  ? <ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" />
                  : <ArrowDownLeft className="h-3.5 w-3.5 text-green-400 shrink-0" />}
                <span className="truncate">{c.label}{c.who ? ` · ${shorten(c.who)}` : ""}</span>
              </span>
              <span className={`font-mono font-semibold shrink-0 ${c.direction === "out" ? "text-destructive" : "text-green-400"}`}>
                {c.direction === "out" ? "−" : "+"}{c.amount} {c.symbol}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Decoded call / instruction summary. */}
      {result.decoded && (
        <div className="space-y-1 text-xs pt-1 border-t border-border/60">
          {result.chain === "evm" && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Action</span>
              <span className="font-mono font-semibold">
                {result.decoded.kind === "native" ? "native transfer"
                  : result.decoded.kind === "transfer" ? "ERC-20 transfer"
                  : result.decoded.kind === "approve" ? "ERC-20 approve"
                  : result.decoded.kind === "unknown" ? "unrecognised call"
                  : result.decoded.kind}
              </span>
            </div>
          )}
          {result.chain === "btc" && (
            <>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Inputs</span><span className="font-mono">{result.decoded.inputCount} (total {result.decoded.totalIn} BTC)</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Outputs</span><span className="font-mono">{result.decoded.outputCount}</span></div>
            </>
          )}
          {result.chain === "sol" && (
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Instruction</span><span className="font-mono font-semibold">{result.decoded.instruction}</span></div>
          )}
          {result.fee && (
            <div className="flex justify-between gap-2 items-start">
              <span className="text-muted-foreground flex items-center gap-1.5"><Fuel className="h-3 w-3" /> Network fee</span>
              <span className="text-right">
                <span className="font-mono">{result.fee.amount} {result.fee.symbol}</span>
                {result.fee.sub && <span className="block text-[10px] text-muted-foreground">{result.fee.sub}</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Risk flags (high/medium), then info notes. */}
      {actionable.length > 0 && (
        <div className="space-y-1.5">
          {actionable.map((r, i) => <RiskRow key={i} risk={r} />)}
        </div>
      )}

      {/* No KNOWN risks — neutral, explicitly NOT a safety guarantee. */}
      {noKnownRisks && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>No <span className="font-medium">known</span> risk patterns detected. This is <span className="font-medium">not</span> a guarantee of safety — absence of a detected issue does not mean the transaction is safe.</span>
        </div>
      )}

      {infos.length > 0 && (
        <div className="space-y-1.5">{infos.map((r, i) => <RiskRow key={i} risk={r} />)}</div>
      )}

      {/* Data-source disclosure: local RPC only, no third party. */}
      {result.source && (
        <div className="flex items-start gap-2 pt-1 border-t border-border/60 text-[11px] text-muted-foreground">
          <ServerCog className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            {result.source.mode === "local-rpc" ? "Checked locally via your RPC" : "Decoded locally via your RPC/indexer"}
            {result.source.queries?.length ? ` (${result.source.queries.join(", ")})` : ""}. Nothing was sent to any third-party scoring service.
            {result.coverageNote ? ` ${result.coverageNote}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
