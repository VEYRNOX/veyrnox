import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, TrendingUp, Newspaper } from "lucide-react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";

// RSS feeds proxied through rss2json.com (free, no API key, CORS-friendly).
// Two sources merged and sorted by date for broader coverage.
const RSS_FEEDS = [
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
];

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchRssJson(url) {
  const fullUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: fullUrl });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCryptoNews() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(({ url, source }) =>
      fetchRssJson(url)
        .then(d => (d.items || []).map(item => ({ ...item, _source: source })))
    )
  );

  const articles = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
    .slice(0, 15);

  if (!articles.length) throw new Error("No articles from any feed");
  return articles;
}

function NewsCard({ article }) {
  const thumbnail = article.enclosure?.link || article.thumbnail || null;

  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group"
    >
      {/* Thumbnails are display-only images from publisher CDNs; no user data
          is sent with the request (I2). img-src https: is already in CSP. */}
      {thumbnail && (
        <img
          src={thumbnail}
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
        {article.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{article.description}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground ml-auto">
            {article._source} · {timeAgo(article.pubDate)}
          </span>
        </div>
      </div>
    </a>
  );
}

export default function CryptoNewsFeed() {
  // I3 guard: this useQuery fires on Dashboard / NewsSentiment mount and calls
  // api.rss2json.com (a third-party RSS proxy). In a decoy or hidden session that
  // is unauthorised network egress, violating I3 (deniable sessions make zero
  // backend calls). Disable the fetch in those sessions — the component then
  // renders a neutral placeholder (NOT an error), so a network/screen observer
  // cannot distinguish a deniability session from an ordinary empty/loading state.
  //
  // DEMO suppression: a demo tour (veyrnox-demo=1, no unlocked vault) has
  // isDecoy/isHidden === false, so i3Active alone would still let the fetch fire —
  // a confirmed live leak. Fold !DEMO into the enabled gate (canonical ECC audit
  // M-6 pattern, useReceiveDetector.js) so a demo session makes zero egress; the
  // same neutral placeholder covers it (no fake news items are injected).
  const { isDecoy, isHidden } = useWallet();
  const i3Active = !isDecoy && !isHidden;
  const egressAllowed = i3Active && !DEMO;

  const { data: news = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["crypto-news"],
    queryFn: fetchCryptoNews,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: egressAllowed,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Market News</p>
        </div>
        {/* I3: refetch() bypasses the `enabled` gate in react-query v5, so in a
            decoy/hidden session tapping this would call api.rss2json.com — live
            egress. Hide the trigger entirely when the query is gated off. */}
        {i3Active && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh market news"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {!i3Active ? (
        // Deniability session: render a neutral, network-silent placeholder that
        // is indistinguishable from "no news available" — never an error state
        // (which would tell an observer a deniability session is active).
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
          <p>No news available right now</p>
        </div>
      ) : isLoading ? (
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
      ) : isError ? (
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
          <p>Could not load news</p>
          <button onClick={() => refetch()} className="text-primary text-xs underline">Retry</button>
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
          <p>No news available right now</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {news.map((article, i) => (
            <NewsCard key={article.guid || article.link || i} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
