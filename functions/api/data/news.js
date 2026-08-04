// functions/api/data/news.js
//
// RSS news proxy. Fetches from rss2json.com on behalf of the client,
// avoiding CORS issues on native and keeping the feed sources server-controlled.
// No API key needed (rss2json free tier). Cached at the edge for 5 minutes.

const RSS_FEEDS = [
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
];

export async function onRequestGet(context) {
  const cacheKey = new Request('https://edge-cache.internal/crypto-news-feed');
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      const res = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.items || []).map(item => ({ ...item, _source: source }));
    })
  );

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
    .slice(0, 20);

  const body = JSON.stringify({ articles });
  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
