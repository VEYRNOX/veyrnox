import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEMO } from "@/api/demoClient";
import { useWallet } from "@/lib/WalletProvider";
import { summarizeAllowance, buildRevokeCalldata, sendRevoke } from "@/wallet-core/evm/approvals";
import { getNetworkInfo } from "@/wallet-core/evm/networks";
import { ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RISK_CFG = {
  low: { cls: "bg-green-500/10 text-green-500", label: "Low Risk" },
  medium: { cls: "bg-yellow-500/10 text-yellow-500", label: "Medium Risk" },
  high: { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
};

// Derive a risk badge from the calldata-decoded allowance (NOT from a stored
// label): an effectively-infinite allowance is the drain vector, worse for an
// untrusted spender. `trusted` only softens an unlimited grant to "medium".
function riskOf(summary, trusted) {
  if (summary.unlimited) return trusted ? "medium" : "high";
  return "low";
}

// Decorate a raw approval row with its calldata-decoded summary (reuses the same
// describeErc20Call the signing/confirm path uses — single source of truth for
// "UNLIMITED").
function decorate(a) {
  const summary = summarizeAllowance({
    rawAmount: a.allowance_raw ?? "0",
    spender: a.spender_address,
    tokenSymbol: a.token_symbol,
    decimals: a.decimals ?? 18,
  });
  return { ...a, summary, risk: riskOf(summary, a.trusted) };
}

export default function TokenApprovals() {
  const qc = useQueryClient();
  const wallet = useWallet();
  const [filter, setFilter] = useState("active");
  const [result, setResult] = useState(null); // post-revoke summary dialog
  const [error, setError] = useState(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["token-approvals"],
    queryFn: () => base44.entities.TokenApproval.list(),
  });

  const approvals = useMemo(() => rows.map(decorate), [rows]);

  const revoke = useMutation({
    mutationFn: async (a) => {
      setError(null);
      // Build + self-check the revoke calldata up front (reuses calldata.js):
      // this is the EXACT approve(spender, 0) that will be signed.
      const { data, summary } = buildRevokeCalldata({
        spender: a.spender_address,
        tokenSymbol: a.token_symbol,
        decimals: a.decimals ?? 18,
      });

      if (DEMO) {
        // SIMULATED revoke — no key, no broadcast. We still exercise the real
        // calldata builder above so the demo shows precisely what a native build
        // would sign. Persist the new state in the in-memory demo store.
        await base44.entities.TokenApproval.update(a.id, { status: "revoked" });
        return { simulated: true, approval: a, data, summary };
      }

      // NATIVE / testnet: real broadcast through the EXISTING signing path. The
      // private key is handed in transiently by withPrivateKey and never stored.
      if (!wallet.isUnlocked) {
        throw new Error("Unlock your wallet to broadcast a revoke transaction.");
      }
      const res = await wallet.withPrivateKey(0, (pk) =>
        sendRevoke({
          networkKey: a.network,
          privateKey: pk,
          symbol: a.token_symbol,
          spender: a.spender_address,
        })
      );
      await base44.entities.TokenApproval.update(a.id, { status: "revoked", tx_hash: res.hash });
      return { simulated: false, approval: a, data, ...res };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["token-approvals"] });
    },
    onError: (e) => setError(e?.message || "Revoke failed"),
  });

  const visible = approvals.filter((a) => filter === "all" || a.status === filter);
  const activeHigh = approvals.filter((a) => a.status === "active" && a.risk === "high").length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Token Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Review the ERC-20 spend allowances you've granted, and revoke the risky ones.
          </p>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? "Demo · simulated" : "Testnet"}
        </span>
      </div>

      <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Unlimited approvals are the top wallet-drain vector. Revoking sets the
          allowance back to <span className="font-mono">0</span> via an{" "}
          <span className="font-mono">approve(spender, 0)</span> transaction signed
          locally. {DEMO ? "In demo mode the revoke is simulated — no transaction is broadcast." : "Mainnet stays gated; revokes run on testnet only."}
        </p>
      </div>

      {activeHigh > 0 && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {activeHigh} high-risk approval{activeHigh > 1 ? "s" : ""} detected
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              These grant unlimited spend to an untrusted contract. Revoke them.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex gap-2">
        {["active", "revoked", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors ${filter === f ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground"}`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {visible.length} approval{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading approvals…</p>}
        {!isLoading && visible.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">
            No {filter === "all" ? "" : filter} token approvals.
          </div>
        )}
        {visible.map((a) => {
          const risk = RISK_CFG[a.risk] || RISK_CFG.low;
          const net = getNetworkInfo(a.network);
          const pending = revoke.isPending && revoke.variables?.id === a.id;
          return (
            <div key={a.id} className={`p-4 rounded-xl border bg-card ${a.status === "revoked" ? "opacity-60 border-border" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold">{a.token_symbol}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm font-medium">{a.spender_name || "Unknown spender"}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${risk.cls}`}>{risk.label}</span>
                    {a.status === "revoked" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">Revoked</span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground truncate">{a.spender_address}</p>
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                    <span>
                      Allowance:{" "}
                      <span className={a.summary.unlimited ? "text-destructive font-semibold" : "text-foreground"}>
                        {a.summary.unlimited ? "UNLIMITED" : `${a.summary.amount} ${a.token_symbol}`}
                      </span>
                    </span>
                    <span>{net?.name || a.network}</span>
                    {a.last_used && <span>Last used: {new Date(a.last_used).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.status === "active" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1 text-xs h-8"
                      disabled={pending}
                      onClick={() => revoke.mutate(a)}
                    >
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                      Revoke
                    </Button>
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Post-revoke confirmation: shows the exact calldata that was built/signed. */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              {result?.simulated ? "Revoke simulated" : "Revoke broadcast"}
            </DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3 pt-2 text-sm">
              <p className="text-muted-foreground">
                Allowance for <span className="font-medium text-foreground">{result.approval.token_symbol}</span> →{" "}
                <span className="font-medium text-foreground">{result.approval.spender_name}</span> set to{" "}
                <span className="font-mono">0</span>.
              </p>
              {result.simulated && (
                <p className="text-xs text-muted-foreground">
                  Demo mode — no transaction was broadcast. This is the calldata a native
                  testnet build would sign locally and send:
                </p>
              )}
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">approve(spender, 0) calldata</p>
                <p className="font-mono text-[11px] break-all">{result.data}</p>
              </div>
              {!result.simulated && result.explorerUrl && (
                <a
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  View on explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Button className="w-full" onClick={() => setResult(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
