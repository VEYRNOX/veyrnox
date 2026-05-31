import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const CURRENCY_COLORS = { BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", BNB: "#F3BA2F", SOL: "#9945FF", USDC: "#2775CA", XRP: "#0085C0", DOGE: "#C2A633", ADA: "#0033AD", TRX: "#EB0029" };

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold">{d.name}</p>
      <p className="text-muted-foreground">${d.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      <p className="text-muted-foreground">{d.percent}%</p>
    </div>
  );
}

function CustomLegend({ payload }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AssetDistributionChart({ wallets }) {
  // Group wallets by currency
  const grouped = {};
  wallets.forEach(w => {
    if (!grouped[w.currency]) grouped[w.currency] = 0;
    grouped[w.currency] += (w.balance || 0) * (USD_RATES[w.currency] || 1);
  });

  const total = Object.values(grouped).reduce((s, v) => s + v, 0);

  const data = Object.entries(grouped)
    .filter(([, usd]) => usd > 0)
    .map(([currency, usd]) => ({
      name: currency,
      value: usd,
      usd,
      percent: total > 0 ? ((usd / total) * 100).toFixed(1) : "0",
    }))
    .sort((a, b) => b.value - a.value);

  if (!data.length) {
    return <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No assets to display</div>;
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius="50%"
            outerRadius="72%"
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={CURRENCY_COLORS[entry.name] || "#888"} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}