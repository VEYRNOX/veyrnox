// M-4 (2026-07-28 audit): a WalletConnect proposal metadata block is entirely
// attacker-controlled — the peer chooses `metadata.icons[0]`. Rendering it
// directly as an <img src> makes the browser fetch an arbitrary URL BEFORE the
// user consents to the session (I2 breach: silent data egress, tracking pixel,
// unbounded body). This helper narrows what we will actually fetch to:
//   1. `data:image/...` URIs (no network fetch)
//   2. `https://` URLs whose host is in an explicit allowlist of hosts we
//      already talk to as part of the WalletConnect protocol
// Anything else (http, javascript:, file:, unknown host, malformed) returns
// false and the caller must render a neutral placeholder instead.

// Neutral 1x1 transparent placeholder used when the icon cannot be trusted.
// Kept as a data: URI so it never triggers a network fetch.
export const PLACEHOLDER_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="8" fill="#1D222B"/>' +
      '<circle cx="24" cy="24" r="10" fill="none" stroke="#4ADAC2" stroke-width="2"/>' +
    '</svg>'
  );

// Hosts we already contact for the WalletConnect protocol itself. Adding a new
// host means the pre-consent modal will fetch from it — think twice before
// widening this list.
export const ALLOWED_ICON_HOSTS = new Set([
  'explorer-api.walletconnect.com',
  'registry.walletconnect.com',
  'explorer-api.walletconnect.org',
  'registry.walletconnect.org',
]);

// Allow small inline data: images. Cap the length so a multi-MB base64 blob
// buried in the proposal cannot balloon a render.
const MAX_DATA_URI_LENGTH = 64 * 1024;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i;

export function isSafeIconUrl(u) {
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
  return ALLOWED_ICON_HOSTS.has(parsed.hostname.toLowerCase());
}

// Convenience: returns the URL if safe, otherwise the neutral placeholder. The
// caller stays a single expression: `<img src={safeIconUrl(meta.icons?.[0])} />`.
export function safeIconUrl(u) {
  return isSafeIconUrl(u) ? u : PLACEHOLDER_ICON;
}
