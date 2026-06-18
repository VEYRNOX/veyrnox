import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, TrendingUp, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
const CATEGORY_COLORS = {
  BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF",
  USDC: "#2775CA", USDT: "#26A17B",
};

function timeAgo(unixSecs) {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchCryptoNews() {
  const res = await fetch(
    "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest"
  );
  if (!res.ok) throw new Error(`cryptocompare news HTTP ${res.status}`);
  const data = await res.json();
  return data.Data?.slice(0, 15) || [];
}

function NewsCard({ article }) {
  const tags = article.categories
    ? article.categories.split("|").slice(0, 3).filter(Boolean)
    : [];

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group"
    >
      {/* News thumbnails come from many CDN domains (CryptoCompare partners). The
          CSP `img-src *` directive in index.html explicitly allows this — a
          decision documented here so it is not removed without review. These are
          display-only images; no user data is sent with the request (I2). */}
      {article.imageurl && (
        <img
          src={article.imageurl}
          alt=""
          className="h-14 w-14 rounded-lg object-cover shrink-0 bg-secondary"
          onError={e => { (/** @type {any} */ (e.target)).style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </p>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{article.body}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: `${CATEGORY_COLORS[tag] || "#888"}22`,
                color: CATEGORY_COLORS[tag] || "hsl(240,5%,55%)",
              }}
            >
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {article.source_info?.name || article.source} · {timeAgo(article.published_on)}
          </span>
        </div>
      </div>
    </a>
  );
}

export default function CryptoNewsFeed() {
  const { data: news = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["crypto-news"],
    queryFn: fetchCryptoNews,
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Market News</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 animate-pulse">
              <div className="h-14 w-14 rounded-lg bg-secondary shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-secondary rounded w-full" />
                <div className="h-3 bg-secondary rounded w-3/4" />
                <div className="h-2 bg-secondary rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
          <p>No news available right now</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {news.map(article => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}