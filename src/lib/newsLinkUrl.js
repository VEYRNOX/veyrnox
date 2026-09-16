// Article-link counterpart to newsThumbUrl.js.
//
// The same RSS payload feeds both. `thumbnail` was narrowed to a publisher-CDN
// allowlist by M-10 (2026-07-28); `link` on the very same element was left raw
// in `href`, so one attacker-influenced field on the card was validated and the
// other was not. Whoever controls a publisher's feed, or anything in the chain
// in front of it, sets both.
//
// CSP (`script-src 'self'` in public/_headers and the index.html meta tag)
// already blocks a `javascript:` href from executing, so this is defence in
// depth rather than a live hole. What it adds on top of CSP is the rest of the
// scheme space — `data:`, `blob:`, `intent:`, `market:`, and on native the
// custom-scheme handlers a Capacitor WebView will happily hand to the OS, none
// of which script-src governs.
//
// Extending the list: add a host ONLY if it belongs to a publisher already in
// `RSS_FEEDS` (functions/api/data/news.js). A host here is somewhere a tap can
// send the user, under the app's own framing.

// Registrable domains for RSS_FEEDS. Matched as the domain itself or any
// subdomain, because publishers move articles between www/amp/regional hosts.
export const ALLOWED_NEWS_LINK_DOMAINS = ['cointelegraph.com', 'decrypt.co'];

export function isSafeNewsLinkUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false;

  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  // Endswith on a DOT-prefixed suffix, never a bare suffix: `evildecrypt.co`
  // ends with `decrypt.co` and must not match.
  return ALLOWED_NEWS_LINK_DOMAINS.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
}

// null, not a placeholder URL — the caller renders a non-link card rather than
// sending a tap somewhere the user did not ask to go (I4: fail closed).
export function safeNewsLinkUrl(u) {
  return isSafeNewsLinkUrl(u) ? u : null;
}
