// Deep-link → WalletConnect pairing plumbing.
//
// A dApp / WalletConnect launches Veyrnox via one of:
//   • veyrnox://wc?uri=<url-encoded wc: URI>          (custom scheme, no hosting)
//   • https://veyrnox.com/wc?uri=<url-encoded wc: URI> (universal / App Link)
// The OS delivers that full URL to the app; we extract the raw `wc:` pairing URI
// and hand it to the connector.
//
// SECURITY: this NEVER auto-pairs. An unsolicited deep link is untrusted input, so
// the URI is only PRE-FILLED into the connector's input for the user to review and
// tap Pair themselves (coercion-resistant posture: no side-effect from an external
// link). The holder below is an in-memory, non-persisted hand-off — nothing is
// written to storage, so it is not a forensic/deniability tell (I3).

let pendingWcUri = null;

/** Stash a pending pairing URI for the connector to pick up on next mount. */
export function setPendingWcUri(uri) {
  pendingWcUri = uri || null;
}

/** Return and CLEAR the pending pairing URI (one-shot hand-off). */
export function takePendingWcUri() {
  const u = pendingWcUri;
  pendingWcUri = null;
  return u;
}

/**
 * Extract a raw `wc:` pairing URI from whatever the OS delivered.
 * Accepts a raw `wc:` string, or a veyrnox:// / https://veyrnox.com URL carrying
 * the URI in a `uri` query param (single- or double-encoded). Returns null if the
 * input does not contain a WalletConnect URI.
 * @param {string} rawUrl
 * @returns {string|null}
 */
export function extractWcUri(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (rawUrl.startsWith('wc:')) return rawUrl;
  try {
    const u = new URL(rawUrl);
    const q = u.searchParams.get('uri');
    if (!q) return null;
    if (q.startsWith('wc:')) return q;
    // Tolerate a double-encoded param.
    const decoded = decodeURIComponent(q);
    return decoded.startsWith('wc:') ? decoded : null;
  } catch {
    return null;
  }
}
