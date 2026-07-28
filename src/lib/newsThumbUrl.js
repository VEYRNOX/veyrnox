// M-10 (2026-07-28 audit): the CryptoNewsFeed RSS payload is a third-party JSON
// blob (api.rss2json.com) whose `enclosure.link` / `thumbnail` fields are
// attacker-influenced strings (anyone controlling the RSS feed origin, the
// rss2json response, or the DNS chain in front of either can set them). Dropped
// straight into <img src>, the browser fetches an arbitrary URL and leaks the
// device IP + a screen-visible pixel per article. This helper narrows what we
// will actually render to:
//   1. `data:image/...` URIs (no network fetch)
//   2. `https://` URLs whose host is in the explicit publisher-CDN allowlist
// Anything else falls back to a neutral placeholder so the news card still
// lays out but no request is issued.
//
// Extending the list: add a host ONLY if it belongs to a publisher already in
// `RSS_FEEDS` (src/components/CryptoNewsFeed.jsx). Every host added is one more
// origin the app pre-consent-fetches from — think twice.

// Neutral placeholder styled to the Veyrnox palette (#050608 surface, #4ADAC2
// accent). Data URI so it never triggers a network fetch.
export const PLACEHOLDER_NEWS_THUMB =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
      '<rect width="56" height="56" rx="8" fill="#050608"/>' +
      '<rect x="12" y="16" width="32" height="4" rx="1" fill="#1D222B"/>' +
      '<rect x="12" y="24" width="24" height="3" rx="1" fill="#1D222B"/>' +
      '<rect x="12" y="31" width="28" height="3" rx="1" fill="#1D222B"/>' +
      '<circle cx="44" cy="42" r="3" fill="#4ADAC2"/>' +
    '</svg>'
  );

// Publisher CDN hosts for RSS_FEEDS in CryptoNewsFeed.jsx (CoinTelegraph +
// Decrypt). Both publishers serve thumbnails from a handful of media
// subdomains; the list is intentionally narrow and each entry must map to a
// feed the app actually subscribes to.
export const ALLOWED_NEWS_THUMB_HOSTS = new Set([
  // CoinTelegraph
  'images.cointelegraph.com',
  's3.cointelegraph.com',
  // Decrypt
  'cdn.decrypt.co',
  'img.decrypt.co',
]);

const MAX_DATA_URI_LENGTH = 64 * 1024;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i;

export function isSafeNewsThumbUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false;

  if (u.startsWith('data:')) {
    if (u.length > MAX_DATA_URI_LENGTH) return false;
    return DATA_IMAGE_RE.test(u);
  }

  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_NEWS_THUMB_HOSTS.has(parsed.hostname.toLowerCase());
}

export function safeNewsThumbUrl(u) {
  return isSafeNewsThumbUrl(u) ? u : PLACEHOLDER_NEWS_THUMB;
}
