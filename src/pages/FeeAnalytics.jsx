import { USD_RATES } from "@/lib/cryptos";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Fuel, TrendingDown, DollarSign, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#eab308"];

function groupByMonth(txs) {
  const grouped = {};
  txs.forEach(tx => {
    if (!tx.fee || tx.fee === 0) return;
    const key = new Date(tx.created_date).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const feeUSD = (tx.fee || 0) * (USD_RATES[tx.currency] || 1);
    grouped[key] = (grouped[key] || 0) + feeUSD;
  });
  return Object.entries(grouped).map(([month, fees]) => ({ month, fees: parseFloat(fees.toFixed(4)) }));
}

function groupByCurrency(txs) {
  const grouped = {};
  txs.forEach(tx => {
    if (!tx.fee || tx.fee === 0) return;
    const feeUSD = (tx.fee || 0) * (USD_RATES[tx.currency] || 1);
    grouped[tx.currency] = (grouped[tx.currency] || 0) + feeUSD;
  });
  return Object.entries(grouped).map(([currency, value]) => ({ currency, value: parseFloat(value.toFixed(4)) }));
}

export default function FeeAnalytics() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 500),
  });

  const feeTxs = transactions.filter(tx => tx.fee && tx.fee > 0);
  const totalFeesUSD = feeTxs.reduce((s, tx) => s + (tx.fee || 0) * (USD_RATES[tx.currency] || 1), 0);
  const avgFeeUSD = feeTxs.length > 0 ? totalFeesUSD / feeTxs.length : 0;
  const monthlyData = groupByMonth(transactions);
  const byCurrency = groupByCurrency(transactions);

  const thisMonth = new Date().toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const thisMonthFees = monthlyData.find(m => m.month === thisMonth)?.fees || 0;

  const cheapestDay = (() => {
    const byDay = {};
    feeTxs.forEach(tx => {
      const day = new Date(tx.created_date).toLocaleDateString("en-GB", { weekday: "short" });
      const feeUSD = (tx.fee || 0) * (USD_RATES[tx.currency] || 1);
      byDay[day] = byDay[day] || { total: 0, count: 0 };
      byDay[day].total += feeUSD;
      byDay[day].count += 1;
    });
    const entries = Object.entries(byDay).map(([day, d]) => ({ day, avg: d.total / d.count }));
    return entries.sort((a, b) => a.avg - b.avg)[0]?.day || "—";
  })();

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Fee Analytics</h1>
        <p className="text-sm text-muted-foreground">Track all network fees paid across transactions</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Fees Paid", value: `$${totalFeesUSD.toFixed(4)}`, icon: <Fuel className="h-4 w-4 text-primary" /> },
          { label: "This Month", value: `$${thisMonthFees.toFixed(4)}`, icon: <DollarSign className="h-4 w-4 text-green-500" /> },
          { label: "Avg Per Transaction", value: `$${avgFeeUSD.toFixed(4)}`, icon: <TrendingDown className="h-4 w-4 text-blue-500" /> },
          { label: "Cheapest Day", value: cheapestDay, icon: <Zap className="h-4 w-4 text-yellow-500" /> },
        ].map(c => (
          <div key={c.label} className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-1">{c.icon}<p className="text-xs text-muted-foreground">{c.label}</p></div>
            <p className="font-bold text-lg">{c.value}</p>
          </div>
        ))}
      </div>

      {feeTxs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Fuel className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No fee data yet</p>
          <p className="text-sm mt-1">Fees will appear here once you have transactions with fee data</p>
        </div>
      ) : (
        <>
          {monthlyData.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-card">
              <p className="text-sm font-semibold mb-4">Monthly Fees (USD)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={v => [`$${v}`, "Fees"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Bar dataKey="fees" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {byCurrency.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-card">
              <p className="text-sm font-semibold mb-4">Fees by Network</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="40%" height={160}>
                  <PieChart>
                    <Pie data={byCurrency} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                      {byCurrency.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => [`$${v}`, "Fees"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {byCurrency.map((d, i) => (
                    <div key={d.currency} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {d.currency}
                      </div>
                      <span className="font-semibold">${d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Recent Fee Transactions</p>
            <div className="space-y-2">
              {feeTxs.slice(0, 10).map(tx => (
                <div key={tx.id} className="flex justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium capitalize">{tx.type || "Transfer"} — {tx.currency}</p>
                    <p className="text-muted-foreground">{new Date(tx.created_date).toLocaleDateString("en-GB")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{tx.fee} {tx.currency}</p>
                    <p className="text-muted-foreground">${((tx.fee || 0) * (USD_RATES[tx.currency] || 1)).toFixed(4)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}