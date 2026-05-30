import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

function genBenchmark(seed, volatility) {
  let val = 100;
  return Array.from({ length: 30 }, (_, i) => {
    val *= 1 + (Math.sin(i * seed) * volatility + (seed - 2) * 0.002);
    return parseFloat(val.toFixed(2));
  });
}

const BTC_DATA = genBenchmark(1.2, 0.03);
const ETH_DATA = genBenchmark(1.8, 0.035);
const SP500_DATA = genBenchmark(2.5, 0.008);

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (29 - i));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
});

const SP500_LABEL = "S&P500";

export default function PortfolioBenchmark() {
  const [timeframe, setTimeframe] = useState(30);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const portfolioData = genBenchmark(1.5, 0.025);
  const portfolioReturn = ((portfolioData[portfolioData.length - 1] - 100) / 100 * 100).toFixed(2);
  const btcReturn = ((BTC_DATA[BTC_DATA.length - 1] - 100) / 100 * 100).toFixed(2);
  const ethReturn = ((ETH_DATA[ETH_DATA.length - 1] - 100) / 100 * 100).toFixed(2);
  const spReturn = ((SP500_DATA[SP500_DATA.length - 1] - 100) / 100 * 100).toFixed(2);

  const chartData = DAYS.slice(-timeframe).map((day, i) => ({
    day,
    Portfolio: portfolioData[i + (30 - timeframe)],
    BTC: BTC_DATA[i + (30 - timeframe)],
    ETH: ETH_DATA[i + (30 - timeframe)],
    [SP500_LABEL]: SP500_DATA[i + (30 - timeframe)],
  }));

  const benchmarks = [
    { label: "Your Portfolio", value: portfolioReturn, color: "#f97316" },
    { label: "Bitcoin (BTC)", value: btcReturn, color: "#eab308" },
    { label: "Ethereum (ETH)", value: ethReturn, color: "#3b82f6" },
    { label: "S&P 500", value: spReturn, color: "#22c55e" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Benchmarking</h1>
        <p className="text-sm text-muted-foreground">Compare your returns against top benchmarks</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {benchmarks.map(b => {
          const up = parseFloat(b.value) >= 0;
          return (
            <div key={b.label} className="p-4 rounded-xl border border-border bg-card">
              <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
              <div className="flex items-center gap-2">
                {up ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <p className={`text-xl font-bold ${up ? "text-green-500" : "text-destructive"}`}>{up ? "+" : ""}{b.value}%</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">30-day return</p>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {parseFloat(portfolioReturn) > parseFloat(btcReturn)
                ? "🏆 Beating Bitcoin this month!"
                : parseFloat(portfolioReturn) > parseFloat(spReturn)
                ? "📈 Beating S&P 500!"
                : "📊 Trailing benchmarks — consider rebalancing"}
            </p>
            <p className="text-xs text-muted-foreground">Portfolio value: ${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[7, 14, 30].map(t => (
          <button key={t} onClick={() => setTimeframe(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeframe === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {t}D
          </button>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-4">Performance (Indexed to 100)</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(timeframe / 4)} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="Portfolio" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line dataKey="BTC" stroke="#eab308" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line dataKey="ETH" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line dataKey={SP500_LABEL} stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}