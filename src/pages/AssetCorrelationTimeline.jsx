import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Newspaper, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AssetCorrelationTimeline() {
  const { data: newsSentiments = [] } = useQuery({
    queryKey: ["news-sentiments"],
    queryFn: () => base44.entities.NewsSentiment.list("-created_date", 20),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Asset Correlation Timeline</h1>
        <p className="text-sm text-muted-foreground">Price correlation across market events</p>
      </div>

      <div className="p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-400" />
          <p className="text-sm font-semibold text-yellow-400">Historical price data not available</p>
        </div>
        <p className="text-xs text-muted-foreground">
          This view requires actual 30-day indexed price series for BTC, ETH, and SOL.
          The previous version hardcoded synthetic price arrays and fabricated market events
          (attributed to "Fed Rate Cut", "SEC Approval", "Exchange Hack") that were static
          constants, not real data.
        </p>
        <p className="text-xs text-muted-foreground">
          A real implementation will integrate a historical OHLCV feed and event markers
          from a verified source. That integration is audited before release.
        </p>
      </div>

      {newsSentiments.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Newspaper className="h-4 w-4" /> News Sentiment Records
          </p>
          <p className="text-xs text-muted-foreground">Records saved from the AI Refresh feature</p>
          {newsSentiments.slice(0, 5).map(n => (
            <div key={n.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${n.sentiment?.includes("bullish") ? "bg-green-500/10 text-green-500" : n.sentiment?.includes("bearish") ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{n.asset}</span>
              <div className="flex-1">
                <p className="text-muted-foreground">{n.headline}</p>
                <p className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {newsSentiments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sentiment records yet</p>
          <p className="text-xs mt-1">Records appear here when saved via the News Sentiment AI Refresh</p>
        </div>
      )}
    </div>
  );
}
