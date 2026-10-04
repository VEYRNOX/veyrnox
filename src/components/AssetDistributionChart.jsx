// @ts-nocheck
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { USD_RATES } from "@/lib/cryptos";
import { formatUsd, resolveLocale } from "@/lib/locale";

// Data-series tokens only (index.css --chart-1..5), assigned by slice rank so
// the largest holding is always teal. A sixth-plus slice reuses the ramp at
// reduced opacity rather than introducing an off-palette colour.
const SERIES_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
export const sliceFill = (i) => `hsl(var(${SERIES_TOKENS[i % SERIES_TOKENS.length]}))`;
export const sliceOpacity = (i) => (i < SERIES_TOKENS.length ? 1 : 0.55);

function CustomTooltip({ active = undefined, payload = undefined }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold">{d.name}</p>
      <p className="mono-value text-muted-foreground">{formatUsd(d.usd, resolveLocale(), { maximumFractionDigits: 2 })}</p>
      <p className="mono-value text-muted-foreground">{d.percent}%</p>
    </div>
  );
}

function CustomLegend({ payload = undefined }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <div className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color, opacity: sliceOpacity(i) }} />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * `slices` — precomputed [{ name, usd }] (the real portfolio page passes
 * assetDistribution(), which carries the same live/approx values as its total).
 * `wallets` — legacy demo-tour shape [{ currency, balance }], priced through the
 * static reference table (demo makes no price request by design).
 */
export default function AssetDistributionChart({ slices = undefined, wallets = [] }) {
  const grouped = {};
  if (slices) {
    slices.forEach(s => { grouped[s.name] = (grouped[s.name] || 0) + s.usd; });
  } else {
    wallets.forEach(w => {
      if (!grouped[w.currency]) grouped[w.currency] = 0;
      grouped[w.currency] += (w.balance || 0) * (USD_RATES[w.currency] || 1);
    });
  }

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
              <Cell key={i} fill={sliceFill(i)} fillOpacity={sliceOpacity(i)} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}