// functions/api/data/news.js
//
// RSS news proxy. Fetches RSS/Atom feeds directly and parses the XML in the
// worker — no third-party intermediary (rss2json blocked CF Workers' UA).
// Cached at the edge for 5 minutes.

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const RSS_FEEDS = [
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
];

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? (m[1] || m[2] || '').trim() : '';
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`);
  const m = xml.match(re);
  return m ? m[1] : '';
}

function parseRssItems(xml, source) {
  const items = [];
  const itemBlocks = xml.split(/<item[\s>]/);
  // Skip the first split (before the first <item>).
  for (let i = 1; i < itemBlocks.length && items.length < 15; i++) {
    const block = itemBlocks[i];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');
    const thumbnail = extractAttr(block, 'media:content', 'url')
      || extractAttr(block, 'enclosure', 'url')
      || '';

    if (title && link) {
      items.push({ title, link, pubDate, description, thumbnail, _source: source });
    }
  }
  return items;
}

export async function onRequestGet(context) {
  // Per-IP cap: unauthenticated proxy fanning out to upstream RSS.
  await enforceRateLimit({ bucket: 'data-news', clientIp: clientIpOf(context.request) });

  const cacheKey = new Request('https://edge-cache.internal/crypto-news-feed');
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      return parseRssItems(xml, source);
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
