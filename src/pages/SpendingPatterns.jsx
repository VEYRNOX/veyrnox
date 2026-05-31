import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

export default function SpendingPatterns() {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 500),
  });

  const sends = transactions.filter(t => t.type === "send");
  const receives = transactions.filter(t => t.type === "receive");

  // Total spend by currency in USD
  const spendByCurrency = {};
  sends.forEach(t => {
    const usd = (t.amount || 0) * (USD_RATES[t.currency] || 1);
    spendByCurrency[t.currency] = (spendByCurrency[t.currency] || 0) + usd;
  });
  const pieData = Object.entries(spendByCurrency).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));

  // Monthly spend (last 6 months)
  const monthly = {};
  for (let i = 5; i >= 0; i--) {
    const m = moment().subtract(i, "months").format("MMM YY");
    monthly[m] = { month: m, spent: 0, received: 0 };
  }
  sends.forEach(t => {
    const m = moment(t.created_date).format("MMM YY");
    if (monthly[m]) monthly[m].spent += (t.amount || 0) * (USD_RATES[t.currency] || 1);
  });
  receives.forEach(t => {
    const m = moment(t.created_date).format("MMM YY");
    if (monthly[m]) monthly[m].received += (t.amount || 0) * (USD_RATES[t.currency] || 1);
  });
  const monthlyData = Object.values(monthly).map(m => ({ ...m, spent: parseFloat(m.spent.toFixed(2)), received: parseFloat(m.received.toFixed(2)) }));

  // Day-of-week pattern
  const byDow = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  sends.forEach(t => {
    const dow = moment(t.created_date).format("ddd");
    byDow[dow] = (byDow[dow] || 0) + (t.amount || 0) * (USD_RATES[t.currency] || 1);
  });
  const dowData = Object.entries(byDow).map(([day, value]) => ({ day, value: parseFloat(value.toFixed(2)) }));

  const totalSpentUSD = sends.reduce((s, t) => s + (t.amount || 0) * (USD_RATES[t.currency] || 1), 0);
  const totalReceivedUSD = receives.reduce((s, t) => s + (t.amount || 0) * (USD_RATES[t.currency] || 1), 0);
  const avgTxUSD = sends.length ? totalSpentUSD / sends.length : 0;
  const thisMonthSpend = monthly[moment().format("MMM YY")]?.spent || 0;

  if (isLoading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spending Patterns</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Insights into your transaction behaviour</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Sent", value: `$${totalSpentUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
          { label: "Total Received", value: `$${totalReceivedUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
          { label: "Avg Tx Size", value: `$${avgTxUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
          { label: "This Month", value: `$${thisMonthSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-base font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Monthly Flow (USD)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => [`$${v.toLocaleString()}`, ""]} />
            <Bar dataKey="spent" name="Sent" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="received" name="Received" fill="#4ade80" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Spend by currency pie */}
        {pieData.length > 0 && (
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Spend by Asset</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [`$${v.toLocaleString()}`, "Spent"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Day of week heatmap */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Activity by Day</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dowData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <YAxis type="category" dataKey="day" tick={{ fontSize: 10 }} width={28} />
              <Tooltip formatter={v => [`$${v.toLocaleString()}`, "Volume"]} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {sends.length === 0 && receives.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No transaction data yet — send or receive crypto to see patterns</p>
        </div>
      )}
    </div>
  );
}