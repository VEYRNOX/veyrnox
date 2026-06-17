import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Info, RefreshCw } from "lucide-react";
import { isLivePricesEnabled } from "@/lib/priceFeed";

const ALL_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT", "BNB", "ADA"];

async function fetchAllCloses() {
  const results = await Promise.all(
    ALL_ASSETS.map(sym =>
      fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=29`)
        .then(r => r.json())
        .then(json => {
          if (json.Response !== "Success") throw new Error(json.Message || "API error");
          return [sym, json.Data.Data.filter(d => d.close > 0).map(d => d.close)];
        })
    )
  );
  return Object.fromEntries(results);
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const slice = (arr) => arr.slice(arr.length - n);
  const ax = slice(xs), ay = slice(ys);
  const mx = ax.reduce((s, v) => s + v, 0) / n;
  const my = ay.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = ax[i] - mx, dy = ay[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 < 1e-10 || dy2 < 1e-10) return 0;
  return Math.max(-1, Math.min(1, num / Math.sqrt(dx2 * dy2)));
}

function getColor(value) {
  if (value === null) return "bg-secondary text-muted-foreground";
  if (value >= 0.99) return "bg-primary/80 text-white";
  if (value >= 0.7) return "bg-red-500/70 text-white";
  if (value >= 0.4) return "bg-orange-500/60 text-white";
  if (value >= 0.1) return "bg-yellow-500/50 text-foreground";
  if (value >= -0.1) return "bg-secondary text-muted-foreground";
  return "bg-green-500/50 text-white";
}

function getLabel(value) {
  if (value === null) return "—";
  if (value >= 0.99) return "Perfect";
  if (value >= 0.7) return "Strong +";
  if (value >= 0.4) return "Moderate +";
  if (value >= 0.1) return "Weak +";
  if (value >= -0.1) return "None";
  return "Negative";
}

export default function CorrelationMatrix() {
  const liveOn = isLivePricesEnabled();

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: closesMap = {}, isLoading, isError } = useQuery({
    queryKey: ["correlation-closes"],
    queryFn: fetchAllCloses,
    enabled: liveOn,
    staleTime: 10 * 60 * 1000,
  });

  const myAssets = [...new Set(wallets.map(w => w.currency).filter(c => ALL_ASSETS.includes(c)))];
  const assets = myAssets.length >= 2 ? myAssets : ALL_ASSETS;

  const matrix = useMemo(() => {
    if (!Object.keys(closesMap).length) return {};
    const result = {};
    for (const row of assets) {
      result[row] = {};
      for (const col of assets) {
        if (row === col) { result[row][col] = 1; continue; }
        const xs = closesMap[row], ys = closesMap[col];
        result[row][col] = xs?.length && ys?.length ? pearson(xs, ys) : null;
      }
    }
    return result;
  }, [closesMap, assets]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Correlation Matrix</h1>
        <p className="text-sm text-muted-foreground">30-day Pearson correlation · CryptoCompare</p>
      </div>

      {!liveOn ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3 text-muted-foreground">
          <div className="h-10 w-10 mx-auto opacity-30 text-4xl font-mono">r</div>
          <p className="font-medium text-foreground">Live prices are off</p>
          <p className="text-sm">Enable live prices in <span className="font-medium text-foreground">Settings → Live Prices</span> to compute real correlations.</p>
        </div>
      ) : isLoading ? (
        <div className="p-4 rounded-xl border border-border bg-card h-48 flex items-center justify-center text-muted-foreground gap-2 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> Computing correlations…
        </div>
      ) : isError ? (
        <div className="p-4 rounded-xl border border-border bg-card h-48 flex items-center justify-center text-muted-foreground text-sm">
          Failed to load price history — check your connection and try again.
        </div>
      ) : (
        <>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Pearson correlation from 30-day daily closes. Ranges from −1 (opposite) to +1 (identical). Aim for assets below 0.5.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-muted-foreground font-normal w-12"></th>
                    {assets.map(a => <th key={a} className="p-2 text-center font-semibold w-14">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {assets.map(row => (
                    <tr key={row}>
                      <td className="p-2 font-semibold pr-3 text-right">{row}</td>
                      {assets.map(col => {
                        const val = matrix[row]?.[col] ?? null;
                        return (
                          <td key={col} className="p-1">
                            <div className={`h-10 w-full rounded-lg flex items-center justify-center font-bold cursor-default ${getColor(val)}`}>
                              {val !== null ? val.toFixed(2) : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-xs font-semibold mb-3">Legend</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Strong Positive (0.7–1.0)", cls: "bg-red-500/70 text-white" },
                { label: "Moderate (0.4–0.7)", cls: "bg-orange-500/60 text-white" },
                { label: "Weak (0.1–0.4)", cls: "bg-yellow-500/50 text-foreground" },
                { label: "Neutral (≈0)", cls: "bg-secondary text-muted-foreground" },
                { label: "Negative (< 0)", cls: "bg-green-500/50 text-white" },
              ].map(l => (
                <div key={l.label} className={`text-[10px] px-2 py-1 rounded-md font-medium ${l.cls}`}>{l.label}</div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-secondary/50 border border-border">
            <p className="text-xs text-muted-foreground">Stablecoins (USDC, USDT) show near-zero correlation with volatile assets — this is correct and expected behaviour.</p>
          </div>
        </>
      )}
    </div>
  );
}
