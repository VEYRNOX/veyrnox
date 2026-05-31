import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const HISTORICAL_PRICES = {
  BTC: { "2020-01-01": 7200, "2021-01-01": 29000, "2022-01-01": 47000, "2023-01-01": 16500, "2024-01-01": 42000, "2024-06-01": 68000 },
  ETH: { "2020-01-01": 130, "2021-01-01": 730, "2022-01-01": 3700, "2023-01-01": 1200, "2024-01-01": 2200, "2024-06-01": 3200 },
  SOL: { "2021-01-01": 1.8, "2022-01-01": 170, "2023-01-01": 9, "2024-01-01": 100, "2024-06-01": 165 },
};

const CURRENCIES = ["BTC", "ETH", "SOL"];
const DATE_OPTIONS = [
  { label: "Jan 2020", key: "2020-01-01" },
  { label: "Jan 2021", key: "2021-01-01" },
  { label: "Jan 2022", key: "2022-01-01" },
  { label: "Jan 2023", key: "2023-01-01" },
  { label: "Jan 2024", key: "2024-01-01" },
  { label: "Jun 2024", key: "2024-06-01" },
];

export default function WhatIfSimulator() {
  const [currency, setCurrency] = useState("BTC");
  const [investDate, setInvestDate] = useState("2023-01-01");
  const [amount, setAmount] = useState("1000");

  const prices = HISTORICAL_PRICES[currency] || {};
  const buyPrice = prices[investDate];
  const currentPrice = Object.values(prices).at(-1);

  const result = useMemo(() => {
    if (!buyPrice || !amount) return null;
    const invested = parseFloat(amount);
    const coinsBought = invested / buyPrice;
    const currentValue = coinsBought * currentPrice;
    const profit = currentValue - invested;
    const percent = (profit / invested) * 100;
    return { invested, coinsBought, currentValue, profit, percent };
  }, [buyPrice, currentPrice, amount]);

  // Build chart data between dates
  const chartData = useMemo(() => {
    const dateKeys = DATE_OPTIONS.map(d => d.key).filter(k => prices[k]);
    return dateKeys.map(k => {
      const val = result ? (parseFloat(amount) / buyPrice) * prices[k] : prices[k];
      return { label: DATE_OPTIONS.find(d => d.key === k)?.label, value: parseFloat(val?.toFixed(2) || 0) };
    });
  }, [currency, investDate, amount, result, buyPrice, prices]);

  const isProfit = result && result.profit >= 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">What-If Simulator</h1>
        <p className="text-sm text-muted-foreground">See how much you'd have made investing at any point in the past</p>
      </div>

      {/* Inputs */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Asset</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Investment Date</Label>
            <Select value={investDate} onValueChange={setInvestDate}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.filter(d => prices[d.key]).map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (USD)</Label>
            <Input className="mt-1.5" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" />
          </div>
        </div>
        {buyPrice && (
          <p className="text-xs text-muted-foreground">
            {currency} price on {DATE_OPTIONS.find(d => d.key === investDate)?.label}: <span className="font-semibold text-foreground">${buyPrice.toLocaleString()}</span>
            &nbsp;→ Current: <span className="font-semibold text-foreground">${currentPrice?.toLocaleString()}</span>
          </p>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`p-5 rounded-xl border ${isProfit ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="flex items-center gap-3 mb-4">
            {isProfit ? <TrendingUp className="h-6 w-6 text-green-500" /> : <TrendingDown className="h-6 w-6 text-destructive" />}
            <div>
              <p className="text-sm text-muted-foreground">Your ${parseFloat(amount).toLocaleString()} investment would be worth</p>
              <p className={`text-3xl font-bold ${isProfit ? "text-green-500" : "text-destructive"}`}>${result.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-card border border-border">
              <p className="text-xs text-muted-foreground">Coins Bought</p>
              <p className="font-bold">{result.coinsBought.toFixed(6)}</p>
              <p className="text-[10px] text-muted-foreground">{currency}</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <p className="text-xs text-muted-foreground">Profit / Loss</p>
              <p className={`font-bold ${isProfit ? "text-green-500" : "text-destructive"}`}>{isProfit ? "+" : ""}${result.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border">
              <p className="text-xs text-muted-foreground">Return</p>
              <p className={`font-bold ${isProfit ? "text-green-500" : "text-destructive"}`}>{isProfit ? "+" : ""}{result.percent.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && result && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-4">Portfolio Value Over Time</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "Value"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <ReferenceLine y={parseFloat(amount)} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" label={{ value: "Invested", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Line dataKey="value" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: "#f97316" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground text-center">⚠️ Historical performance does not guarantee future results. For educational purposes only.</p>
      </div>
    </div>
  );
}