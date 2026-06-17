import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";
import { isLivePricesEnabled } from "@/lib/priceFeed";
import moment from "moment";

const FILTER_ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"];

async function fetchNews(asset) {
  const cats = asset === "all" ? FILTER_ASSETS.join(",") : asset;
  const res = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${cats}&sortOrder=latest`);
  if (!res.ok) throw new Error("Fetch failed");
  const json = await res.json();
  if (!Array.isArray(json.Data)) throw new Error(json.Message || "Bad response");
  return json.Data.slice(0, 25);
}

export default function NewsSentimentPage() {
  const [filterAsset, setFilterAsset] = useState("all");
  const liveOn = isLivePricesEnabled();

  const { data: articles = [], isLoading, isError } = useQuery({
    queryKey: ["crypto-news", filterAsset],
    queryFn: () => fetchNews(filterAsset),
    enabled: liveOn,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-primary" /> Crypto News
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live news feed · CryptoCompare</p>
      </div>

      {/* Asset filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...FILTER_ASSETS].map(a => (
          <button key={a} onClick={() => setFilterAsset(a)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${filterAsset === a ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {a === "all" ? "All" : a}
          </button>
        ))}
      </div>

      {!liveOn ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3 text-muted-foreground">
          <Newspaper className="h-10 w-10 mx-auto opacity-30" />
          <p className="font-medium text-foreground">Live prices are off</p>
          <p className="text-sm">Enable live prices in <span className="font-medium text-foreground">Settings → Live Prices</span> to see the real-time news feed.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground gap-2 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading news…
        </div>
      ) : isError ? (
        <div className="text-center py-14 text-muted-foreground text-sm">
          Failed to load news — check your connection and try again.
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground text-sm">No articles found.</div>
      ) : (
        <div className="space-y-3">
          {articles.map(n => (
            <a key={n.id} href={n.url} target="_blank" rel="noreferrer"
              className="block p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug">{n.title}</p>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
              </div>
              {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{n.source_info?.name || n.source}</span>
                <span>{moment.unix(n.published_on).fromNow()}</span>
              </div>
              {n.categories && (
                <div className="flex gap-1 flex-wrap">
                  {n.categories.split("|").slice(0, 4).map(c => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{c}</span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
