// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44, LLM_AVAILABLE } from "@/api/base44Client";
import { Newspaper, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CryptoNewsFeed from "@/components/CryptoNewsFeed";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { safeFormat } from "@/lib/safeDate";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

const ASSETS = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

const SENTIMENT_CONFIG = {
  very_bullish: { icon: TrendingUp, color: "text-success", bg: "bg-success/10 border-success/20", label: "Very Bullish", bar: 100 },
  bullish: { icon: TrendingUp, color: "text-success", bg: "bg-success/10 border-success/20", label: "Bullish", bar: 70 },
  neutral: { icon: Minus, color: "text-muted-foreground", bg: "bg-secondary border-border", label: "Neutral", bar: 50 },
  bearish: { icon: TrendingDown, color: "text-caution", bg: "bg-caution/10 border-caution/20", label: "Bearish", bar: 30 },
  very_bearish: { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", label: "Very Bearish", bar: 0 },
};


function AssetSentimentBar({ asset, news }) {
  const assetNews = news.filter(n => n.asset === asset);
  if (!assetNews.length) return null;
  const rawAvg = assetNews.reduce((a, n) => a + Number(n.score || 0), 0) / assetNews.length;
  const avgScore = Number.isFinite(rawAvg) ? rawAvg : 0;
  const pct = ((avgScore + 1) / 2) * 100;
  const color = avgScore > 0.3 ? "hsl(var(--success))" : avgScore > -0.3 ? "hsl(var(--muted-foreground))" : "hsl(var(--destructive))";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono w-10 shrink-0">{asset}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-10 text-right" style={{ color }}>{avgScore >= 0 ? "+" : ""}{avgScore.toFixed(2)}</span>
    </div>
  );
}

export default function NewsSentimentPage() {
  const queryClient = useQueryClient();
  const [filterAsset, setFilterAsset] = useState("all");

  const { data: saved = [] } = useQuery({ queryKey: ["news-sentiment"], queryFn: () => base44.entities.NewsSentiment.list("-created_date") });

  const allNews = saved;
  const filtered = filterAsset === "all" ? allNews : allNews.filter(n => n.asset === filterAsset);

  const refresh = useMutation({
    mutationFn: () => {
      if (!LLM_AVAILABLE) return Promise.reject(new Error("unavailable"));
      return base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the current crypto market sentiment for BTC, ETH, and SOL based on today's news and on-chain data. Return a JSON array of 3 news items with fields: asset (BTC/ETH/SOL), headline (string), source (string), sentiment (very_bullish/bullish/neutral/bearish/very_bearish), score (-1 to 1), published_at (ISO), summary (1-2 sentences).`,
        add_context_from_internet: true,
        response_json_schema: { type: "object", properties: { items: { type: "array", items: { type: "object" } } } },
      });
    },
    onSuccess: async (res) => {
      const items = (/** @type {any} */ (res))?.items || [];
      for (const item of items) {
        await base44.entities.NewsSentiment.create(item);
      }
      queryClient.invalidateQueries({ queryKey: ["news-sentiment"] });
      toast.success(`Updated ${items.length} sentiment signals`);
    },
    onError: () => toast.error("Refresh failed"),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Newspaper className="h-6 w-6 text-primary" /> News Sentiment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time crypto news sentiment</p>
        </div>
        {LLM_AVAILABLE && !isDeniabilityOrDemoActive() && (
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refresh.isPending ? "motion-safe:animate-spin" : ""}`} />
            {refresh.isPending ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      {/* Overall sentiment bars */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">Market Sentiment Overview</p>
        {ASSETS.filter(a => allNews.some(n => n.asset === a)).map(a => (
          <AssetSentimentBar key={a} asset={a} news={allNews} />
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...ASSETS].map(a => (
          <button key={a} onClick={() => setFilterAsset(a)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${filterAsset === a ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {a}
          </button>
        ))}
      </div>

      {/* Sentiment items */}
      <div className="space-y-3">
        {filtered.map((n, i) => {
          const cfg = SENTIMENT_CONFIG[n.sentiment] || SENTIMENT_CONFIG.neutral;
          const score = Number.isFinite(Number(n.score)) ? Number(n.score) : 0;
          return (
            <div key={i} className={`p-4 rounded-xl border ${cfg.bg} space-y-2`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-bold bg-secondary px-1.5 py-0.5 rounded">{n.asset}</span>
                  <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                </div>
                <span className={`text-xs font-bold ${cfg.color}`}>{score >= 0 ? "+" : ""}{score.toFixed(2)}</span>
              </div>
              <p className="text-sm font-semibold leading-snug">{n.headline}</p>
              {n.summary && <p className="text-xs text-muted-foreground">{n.summary}</p>}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{n.source}</span>
                <span>{safeFormat(n.published_at, d => formatDistanceToNow(d, { addSuffix: true }))}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live news feed from CryptoCompare */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <CryptoNewsFeed />
      </div>
    </div>
  );
}