import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "@/lib/recharts";
import CoinLogo from "@/components/CoinLogo";
import { summarizeSpending } from "@/lib/spendingPatterns";

// Native-unit amount formatter (no fiat — see lib/spendingPatterns for why).
const fmtAmount = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });

export default function SpendingPatterns() {
  const { data: transactions = [], isLoading, isError } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 500),
  });

  const { counts, byAsset, monthly, byDow } = summarizeSpending(transactions);
  const dowData = byDow.map((d) => ({ day: d.day, count: d.sent + d.received }));

  if (isLoading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (isError) return <div className="max-w-2xl mx-auto py-16 text-center text-sm text-destructive">Couldn't load transaction activity. Please try again.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spending Patterns</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your transaction activity. Amounts are shown in each asset's own units — no fiat
          conversion (this build has no live price feed).
        </p>
      </div>

      {/* Activity counts (asset-agnostic, real) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Sent", value: counts.sent },
          { label: "Received", value: counts.received },
          { label: "Transactions", value: counts.total },
          { label: "This Month", value: counts.thisMonth },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-base font-bold">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Monthly activity — transaction COUNTS (not fiat value) */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Monthly Activity (transactions)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip formatter={(v, n) => [v, n === "sent" ? "Sent" : "Received"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="sent" name="Sent" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="received" name="Received" fill="#4ade80" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-asset native breakdown — real amounts, never summed across assets */}
      {byAsset.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">By Asset (native amounts)</p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              <span>Asset</span><span className="text-right">Sent</span><span className="text-right">Received</span>
            </div>
            {byAsset.map((a) => (
              <div key={a.currency} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <CoinLogo symbol={a.currency} size={18} />
                  <span className="font-medium truncate">{a.currency}</span>
                </span>
                <span className="text-right font-mono">
                  {fmtAmount(a.sentAmount)} {a.currency}
                  <span className="block text-[10px] text-muted-foreground">{a.sentCount} tx</span>
                </span>
                <span className="text-right font-mono">
                  {fmtAmount(a.receivedAmount)} {a.currency}
                  <span className="block text-[10px] text-muted-foreground">{a.receivedCount} tx</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-of-week activity — transaction counts */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Activity by Day (transactions)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dowData} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="day" tick={{ fontSize: 10 }} width={28} />
            <Tooltip formatter={(v) => [v, "Transactions"]} />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {counts.total === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No transaction data yet — send or receive crypto to see patterns</p>
        </div>
      )}
    </div>
  );
}
