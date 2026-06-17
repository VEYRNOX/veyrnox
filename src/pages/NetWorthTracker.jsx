import { useWallet } from "@/lib/WalletProvider";
import { usePortfolio } from "@/lib/portfolioBalances";
import { buildAllocation } from "@/lib/netWorthAllocation";
import { CURRENCY_COLORS, approxUsd } from "@/lib/cryptos";
import { formatFiat } from "@/components/FiatCurrencySelector";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import CoinLogo from "@/components/CoinLogo";
import { RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Crypto Net Worth (promoted from the honest-disabled NetWorth shell). Shows the
// owner's REAL on-chain holdings via usePortfolio — total + allocation donut +
// per-asset rows — with USD that is LIVE (opt-in price feed) or clearly-labeled
// APPROXIMATE (reference rates) when live is off/unavailable. CRYPTO ONLY: the
// old manual real-world assets were dropped — they lived in a global, non-vault-
// scoped table that a decoy session would expose (I3). usePortfolio is session-
// scoped (a decoy sees only the decoy's holdings; no isDecoy branch here).
// ─────────────────────────────────────────────────────────────────────────────

const fmtPriceTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

export default function NetWorthTracker() {
  const { isUnlocked, wallets, walletAddresses } = useWallet();
  const { data: portfolio, isLoading, priceBasis, pricesUpdatedAt, refetchPrices } = usePortfolio(wallets, walletAddresses);

  const total = portfolio?.grandTotal ?? 0;
  const incomplete = !!portfolio?.indeterminate;
  const assetTotals = portfolio?.assetTotals || {};
  const live = priceBasis === "live";
  // null amount/usd = indeterminate (read failed) → "—", never a misleading $0.
  const fmtUsd = (n) => (n == null ? "—" : live ? formatFiat(n, "USD") : approxUsd(n));
  const allocation = buildAllocation(assetTotals);

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-xl font-bold">Crypto Net Worth</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see your on-chain holdings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Crypto Net Worth</h1>
        <p className="text-sm text-muted-foreground">Your on-chain holdings — does not include external assets.</p>
      </div>

      {/* Total */}
      <div className="p-5 rounded-2xl border border-border bg-card text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Total holdings</p>
        <p className="text-4xl font-bold mt-1">{isLoading ? "…" : fmtUsd(total)}</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          {incomplete && <span className="text-amber-600 dark:text-amber-400">partial — some balances couldn't be read</span>}
          {live ? (
            <button
              type="button"
              onClick={() => refetchPrices?.()}
              className="inline-flex items-center gap-1 hover:text-foreground"
              title="Refresh live prices"
            >
              <RefreshCw className="h-3 w-3" /> Live{pricesUpdatedAt ? " · " + fmtPriceTime(pricesUpdatedAt) : ""}
            </button>
          ) : (
            <span>Approximate</span>
          )}
        </div>
      </div>

      {/* Allocation donut */}
      {allocation.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-3">Allocation</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={allocation} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="usd" nameKey="symbol">
                  {allocation.map((d) => <Cell key={d.symbol} fill={CURRENCY_COLORS[d.symbol] || "#6b7280"} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {allocation.map((d) => (
                <div key={d.symbol} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CURRENCY_COLORS[d.symbol] || "#6b7280" }} />
                    {d.symbol}
                  </span>
                  <span className="font-medium">{fmtUsd(d.usd)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-asset holdings */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3">Holdings</p>
        {Object.keys(assetTotals).length === 0 ? (
          <p className="text-sm text-muted-foreground">No holdings yet.</p>
        ) : (
          Object.entries(assetTotals).map(([symbol, t]) => (
            <div key={symbol} className="flex justify-between items-center text-sm py-1 border-b border-border/50 last:border-0">
              <span className="flex items-center gap-2 text-muted-foreground"><CoinLogo symbol={symbol} size={20} />{symbol}</span>
              <span className="font-medium">{t.indeterminate ? "—" : fmtUsd(t.usd)}</span>
            </div>
          ))
        )}
      </div>

      {/* Reference-rate disclosure — shown only when figures are the approximate
          stale rates (when live, values are real-time and need no caveat). The
          token's presence here also satisfies the usdDisclosure guard. */}
      {!live && <ReferenceRateNote />}
    </div>
  );
}
