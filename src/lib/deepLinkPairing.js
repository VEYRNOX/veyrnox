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

// Codex P2 2026-08-15: expire pending WC URIs after PENDING_TTL_MS so a link
// delivered pre-unlock cannot survive indefinitely and appear pre-filled after
// the user later unlocks. 5 minutes matches the WC proposal-expiry window
// (session.js DEFAULT_PROPOSAL_TTL_MS). The lock hook in WalletProvider also
// calls clearPendingWcUri() to drop the URI on every lock/panic-wipe.
const PENDING_TTL_MS = 5 * 60 * 1000;

// Codex P2 2026-08-15: hard ceiling on any inbound WC URI. A well-formed
// WalletConnect v2 pairing URI is ~180 chars (topic + relay + sym-key +
// methods); 4096 leaves plenty of headroom for future relay/protocol growth
// while blocking DoS payloads that would drive URL/decodeURIComponent /
// URLSearchParams / SDK CPU + memory churn on the deep-link path before any
// structural check runs. Applied at BOTH extractWcUri (before URL parse) AND
// setPendingWcUri (defence in depth for any future caller).
const MAX_WC_URI_LEN = 4096;

let pendingWcUri = null;
let pendingWcAt = 0;

/** Stash a pending pairing URI for the connector to pick up on next mount. */
export function setPendingWcUri(uri) {
  if (typeof uri === 'string' && uri.length > MAX_WC_URI_LEN) {
    pendingWcUri = null;
    pendingWcAt = 0;
    return;
  }
  pendingWcUri = uri || null;
  pendingWcAt = uri ? Date.now() : 0;
}

/**
 * Return and CLEAR the pending pairing URI (one-shot hand-off).
 * Returns null if the URI has aged past PENDING_TTL_MS (Codex P2 2026-08-15):
 * a stale link the user never intended to complete should not surprise them
 * on a later unlock.
 */
export function takePendingWcUri() {
  const u = pendingWcUri;
  const at = pendingWcAt;
  pendingWcUri = null;
  pendingWcAt = 0;
  if (!u) return null;
  if (Date.now() - at > PENDING_TTL_MS) return null;
  return u;
}

/**
 * Drop any pending pairing URI without taking it. Called on lock / panic wipe
 * so a link delivered during the previous session cannot re-emerge in the
 * next session (Codex P2 2026-08-15).
 */
export function clearPendingWcUri() {
  pendingWcUri = null;
  pendingWcAt = 0;
}

// Codex P2 2026-08-15: the previous extractor accepted ANY URL carrying
// `?uri=wc:...`, so another app could open `veyrnox://anything?uri=<wc-uri>`
// (or a random https URL) and drive Veyrnox to /walletconnect. Restrict to
// the two documented entry points: the custom scheme `veyrnox://wc*` and the
// universal link `https://veyrnox.com/wc*`. A raw `wc:` string still passes
// as before (that's what the connector itself hands us on iOS's WC callback).
function isVeyrnoxPairingUrl(u) {
  if (u.protocol === 'veyrnox:') {
    // veyrnox://wc?uri=… → hostname 'wc'. Some URL parsers put single-segment
    // authorities on hostname, others on pathname; accept both shapes.
    if (u.hostname === 'wc') return true;
    if (u.hostname === '' && (u.pathname === '/wc' || u.pathname.startsWith('/wc/'))) return true;
    return false;
  }
  if (u.protocol === 'https:' && u.hostname === 'veyrnox.com') {
    return u.pathname === '/wc' || u.pathname.startsWith('/wc/');
  }
  return false;
}

/**
 * Extract a raw `wc:` pairing URI from whatever the OS delivered.
 * Accepts a raw `wc:` string, or a veyrnox://wc / https://veyrnox.com/wc URL
 * carrying the URI in a `uri` query param (single- or double-encoded).
 * Returns null if the input does not contain a WalletConnect URI OR if the
 * URL is not one of the documented pairing entry points.
 * @param {string} rawUrl
 * @returns {string|null}
 */
export function extractWcUri(rawUrl) {
  const result = _extract(rawUrl);
  emitDeepLinkAudit(result != null ? 'accept' : 'reject', {
    // NEVER log the wc: URI itself (contains sym-key material). Only the
    // ORIGIN of the URL and the outcome — enough for a future monitor to spot
    // repeated rejects without leaking key material. Nothing subscribes to
    // this today; see emitDeepLinkAudit's status note below.
    origin: safeOrigin(rawUrl),
    length: typeof rawUrl === 'string' ? rawUrl.length : 0,
  });
  return result;
}

function _extract(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (rawUrl.length > MAX_WC_URI_LEN) return null;
  if (rawUrl.startsWith('wc:')) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (!isVeyrnoxPairingUrl(u)) return null;
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

function safeOrigin(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  if (rawUrl.startsWith('wc:')) return 'wc-raw';
  try { const u = new URL(rawUrl); return `${u.protocol}//${u.hostname}`; }
  catch { return null; }
}

/**
 * Fire a same-tab audit event for every deep-link decision.
 *
 * STATUS: HOOK POINT — NOTHING CONSUMES THIS YET. Outside its own regression
 * test, no production code registers a `veyrnox:deeplink` listener, so in a
 * shipped build the event fires into the void: nothing persists it, counts it,
 * rate-limits on it, or shows it to anyone. Do not describe it as an audit
 * TRAIL or as evidence — there is no record. It is a seam a future monitor or
 * reject-rate-limiter can attach to without this module having to know about
 * it, and until one exists it buys observability of exactly nothing.
 *
 * That is a deliberate scoping call, not an oversight: the origin allowlist in
 * isVeyrnoxPairingUrl() is the actual security control and is unaffected by
 * this either way, and inventing a consumer with no one to read it would be
 * speculative work — and a rate-limiter driven off these events would be new
 * security BEHAVIOUR, which belongs in its own change with its own review.
 *
 * Best-effort; a missing bus never blocks pairing.
 *
 * @param {'accept'|'reject'} decision
 * @param {{origin:string|null, length:number}} meta
 */
export function emitDeepLinkAudit(decision, meta) {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('veyrnox:deeplink', {
      detail: { decision, ...meta, at: Date.now() },
    }));
  } catch { /* noop */ }
}
