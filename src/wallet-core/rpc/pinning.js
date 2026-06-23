// wallet-core/rpc/pinning.js
//
// NETWORK HARDENING — egress host pinning + SPKI pin map (Feature 4).
//
// HONEST POSTURE (read this — it bounds what this module can truthfully claim):
//   - WEB: a browser JS app TERMINATES TLS in the engine and exposes NO API to
//     read the served leaf certificate / its SPKI. So a true SPKI pin CANNOT be
//     enforced honestly in the browser. What we CAN enforce on web is an ALLOWLIST
//     of egress hostnames — the I2 surface (WHERE traffic is allowed to go). A host
//     that is not on the allowlist FAILS CLOSED (throw, never silently pass).
//   - NATIVE (Capacitor): the SPKI_PINS map below is the data a native pinned-cert
//     transport (Capacitor HTTP `pinnedCertificates` / an OkHttp CertificatePinner
//     on Android, NSURLSession pinning on iOS) consumes. That native enforcement is
//     TARGET — it needs a real-device build + on-device verification + the audit and
//     is NOT claimed as active here. `getExpectedSpki()` exposes the map so the
//     native bridge can configure pinning; this JS module does not verify a leaf
//     cert it cannot see (no fake security — I4 fail honest).
//
// Fail-closed everywhere: unknown host, empty pin set, or malformed URL → throw a
// coded error (PIN_ERROR), never a permissive default.

// Machine-readable error codes (the contract the tests pin — copy can change).
export const PIN_ERROR = Object.freeze({
  BAD_URL: 'PIN_BAD_URL',
  UNKNOWN_HOST: 'PIN_UNKNOWN_HOST',
  NO_PINS: 'PIN_NO_PINS',
});

class PinError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PinError';
    this.code = code;
  }
}

// Known RPC/indexer hostnames -> expected SPKI sha256 base64 pins.
//
// These are the default egress targets in the EVM/BTC/SOL network registries.
// The SPKI VALUES below are PLACEHOLDERS for the native pinning config and MUST be
// replaced with the operator's pinned leaf/intermediate SPKI hashes (captured per
// host and rotated) before any native build claims pinning. They are intentionally
// labelled so a real cert can never be silently impersonated by a stale guess:
// on web they are unused (host-allowlist only); on native they are TARGET config.
const SPKI_PINS = Object.freeze({
  // ---- EVM (publicnode + chain defaults) ----
  'ethereum-sepolia-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'eth.llamarpc.com': ['sha256/PLACEHOLDER_LLAMARPC_REPLACE_ON_DEVICE='],
  'rpc-amoy.polygon.technology': ['sha256/PLACEHOLDER_POLYGON_REPLACE_ON_DEVICE='],
  'polygon-bor-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'sepolia-rollup.arbitrum.io': ['sha256/PLACEHOLDER_ARBITRUM_REPLACE_ON_DEVICE='],
  'arbitrum-one-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'sepolia.optimism.io': ['sha256/PLACEHOLDER_OPTIMISM_REPLACE_ON_DEVICE='],
  'optimism-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'avalanche-fuji-c-chain-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'avalanche-c-chain-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'bsc-testnet-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],
  'bsc-rpc.publicnode.com': ['sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE='],

  // ---- BTC (Esplora / mempool.space) ----
  'mempool.space': ['sha256/PLACEHOLDER_MEMPOOL_REPLACE_ON_DEVICE='],

  // ---- SOL (Solana RPC defaults) ----
  'api.devnet.solana.com': ['sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE='],
  'api.testnet.solana.com': ['sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE='],
  'api.mainnet-beta.solana.com': ['sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE='],

  // ---- test-only entry: a pinned host with NO pins, to exercise NO_PINS fail-closed ----
  'veyrnox-test-empty-pins.invalid': [],
});

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/** PURE: extract a lowercased hostname from a URL, or throw PIN_ERROR.BAD_URL. */
function hostOf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new PinError(PIN_ERROR.BAD_URL, `Not a valid URL: ${String(url).slice(0, 80)}`);
  }
  return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Is this hostname on the pin allowlist? (PURE) */
export function isPinnedHost(hostname) {
  return Object.prototype.hasOwnProperty.call(SPKI_PINS, String(hostname).toLowerCase());
}

/**
 * The expected SPKI pins for a host, or null if the host is not pinned. (PURE)
 * Consumed by the NATIVE pinned-cert transport (TARGET); unused on web.
 * @returns {string[]|null}
 */
export function getExpectedSpki(hostname) {
  const h = String(hostname).toLowerCase();
  return isPinnedHost(h) ? SPKI_PINS[h].slice() : null;
}

/**
 * Assert a URL's host is pinned and verifiable. FAIL CLOSED.
 *   - malformed URL          -> throws PIN_ERROR.BAD_URL
 *   - host not on allowlist  -> throws PIN_ERROR.UNKNOWN_HOST  (loopback included)
 *   - host present, 0 pins   -> throws PIN_ERROR.NO_PINS
 * On success returns true (web: host allowlist satisfied; native consumes the SPKI).
 * @param {string} url
 * @returns {true}
 */
export function verifyPin(url) {
  const host = hostOf(url);
  if (!isPinnedHost(host)) {
    throw new PinError(PIN_ERROR.UNKNOWN_HOST, `Host is not pinned: ${host}`);
  }
  const pins = SPKI_PINS[host];
  if (!Array.isArray(pins) || pins.length === 0) {
    throw new PinError(PIN_ERROR.NO_PINS, `No SPKI pins configured for ${host}`);
  }
  return true;
}

/**
 * Fail-closed fetch wrapper. Verifies the egress host is pinned BEFORE the request
 * is made (so an unknown/unpinned host never sees a single byte). On native, a
 * pinned-cert transport (TARGET) would enforce the SPKI; on web this is the
 * host-allowlist enforcement of WHERE traffic may go.
 *
 * @param {string} url
 * @param {object} [init]                fetch init
 * @param {object} [opts]
 * @param {Function} [opts.fetchImpl]    fetch implementation (default global fetch)
 * @param {boolean} [opts.allowLoopback] explicit operator escape hatch for a local
 *                                       node (http://localhost / 127.0.0.1 / ::1).
 * @returns {Promise<Response>}
 */
export async function pinnedFetch(url, init = {}, opts = {}) {
  const { fetchImpl = globalThis.fetch, allowLoopback = false } = opts;
  const host = hostOf(url); // throws BAD_URL before any egress
  if (allowLoopback && LOOPBACK.has(host)) {
    return fetchImpl(url, init);
  }
  verifyPin(url); // throws UNKNOWN_HOST / NO_PINS before any egress
  return fetchImpl(url, init);
}
