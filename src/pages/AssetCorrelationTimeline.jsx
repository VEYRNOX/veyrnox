import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { Newspaper, TrendingUp, TrendingDown } from "lucide-react";

// Simulated price history indexed from 100 with event markers
const PRICE_SERIES = {
  BTC: [100, 103, 99, 105, 112, 108, 115, 118, 113, 122, 119, 125, 121, 128, 132, 127, 135, 138, 133, 141, 138, 145, 149, 144, 152, 148, 155, 160, 156, 163],
  ETH: [100, 104, 101, 107, 111, 106, 114, 117, 110, 120, 116, 123, 118, 126, 129, 124, 132, 136, 130, 138, 135, 143, 147, 142, 150, 146, 153, 158, 154, 161],
  SOL: [100, 107, 102, 110, 118, 112, 122, 126, 117, 130, 124, 133, 127, 136, 141, 135, 145, 150, 142, 152, 148, 158, 164, 157, 167, 162, 170, 176, 171, 179],
};

const EVENTS = [
  { day: 4, label: "Fed Rate Cut", sentiment: "bullish", impact: "high" },
  { day: 9, label: "SEC Approval", sentiment: "bullish", impact: "high" },
  { day: 14, label: "Exchange Hack", sentiment: "bearish", impact: "high" },
  { day: 19, label: "Institutional Buy", sentiment: "bullish", impact: "medium" },
  { day: 24, label: "Regulatory News", sentiment: "bearish", impact: "medium" },
  { day: 28, label: "ETF Launch", sentiment: "bullish", impact: "high" },
];

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (29 - i));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
});

export default function AssetCorrelationTimeline() {
  const [assets, setAssets] = useState(["BTC", "ETH"]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { data: newsSentiments = [] } = useQuery({
    queryKey: ["news-sentiments"],
    queryFn: () => base44.entities.NewsSentiment.list("-created_date", 20),
  });

  const toggleAsset = (a) => setAssets(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const chartData = DAYS.map((day, i) => {
    const obj = { day };
    assets.forEach(a => { if (PRICE_SERIES[a]) obj[a] = PRICE_SERIES[a][i]; });
    return obj;
  });

  const ASSET_COLORS = { BTC: "#f97316", ETH: "#3b82f6", SOL: "#22c55e" };

  const eventAtDay = selectedEvent !== null ? EVENTS[selectedEvent] : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Asset Correlation Timeline</h1>
        <p className="text-sm text-muted-foreground">See how major events affected asset prices over 30 days</p>
      </div>

      {/* Asset toggles */}
      <div className="flex gap-2">
        {Object.keys(PRICE_SERIES).map(a => (
          <button key={a} onClick={() => toggleAsset(a)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${assets.includes(a) ? "border-transparent text-white" : "border-border text-muted-foreground bg-card"}`}
            style={assets.includes(a) ? { background: ASSET_COLORS[a] } : {}}>
            {a}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-4">Price Performance (Indexed to 100) with Events</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {EVENTS.map((ev, i) => (
              <ReferenceLine key={i} x={DAYS[ev.day]} stroke={ev.sentiment === "bullish" ? "#22c55e" : "#ef4444"} strokeDasharray="3 3"
                label={{ value: "●", position: "top", fontSize: 10, fill: ev.sentiment === "bullish" ? "#22c55e" : "#ef4444", cursor: "pointer" }} />
            ))}
            {assets.map(a => (
              <Line key={a} dataKey={a} stroke={ASSET_COLORS[a]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Event list */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Market Events</p>
        {EVENTS.map((ev, i) => (
          <div key={i} onClick={() => setSelectedEvent(selectedEvent === i ? null : i)}
            className={`p-3 rounded-xl border cursor-pointer transition-colors ${selectedEvent === i ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}>
            <div className="flex items-center gap-3">
              {ev.sentiment === "bullish" ? <TrendingUp className="h-4 w-4 text-green-500 shrink-0" /> : <TrendingDown className="h-4 w-4 text-destructive shrink-0" />}
              <div className="flex-1">
                <p className="text-sm font-medium">{ev.label}</p>
                <p className="text-xs text-muted-foreground">{DAYS[ev.day]} · {ev.impact} impact</p>
              </div>
              {assets.map(a => {
                if (!PRICE_SERIES[a]) return null;
                const before = PRICE_SERIES[a][Math.max(0, ev.day - 1)];
                const after = PRICE_SERIES[a][Math.min(29, ev.day + 2)];
                const chg = ((after - before) / before * 100).toFixed(1);
                return (
                  <div key={a} className="text-right text-xs">
                    <p style={{ color: ASSET_COLORS[a] }} className="font-semibold">{a}</p>
                    <p className={parseFloat(chg) >= 0 ? "text-green-500" : "text-destructive"}>{parseFloat(chg) >= 0 ? "+" : ""}{chg}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* News from DB */}
      {newsSentiments.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><Newspaper className="h-4 w-4" /> Recent News Sentiment</p>
          {newsSentiments.slice(0, 5).map(n => (
            <div key={n.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${n.sentiment?.includes("bullish") ? "bg-green-500/10 text-green-500" : n.sentiment?.includes("bearish") ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{n.asset}</span>
              <p className="text-muted-foreground">{n.headline}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}