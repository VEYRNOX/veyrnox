// wallet-core/netUrl.js
//
// Validate user/operator-supplied RPC/indexer OVERRIDE URLs before they become
// the egress target for balance reads and broadcasts (setRpcUrl / setEsploraUrl /
// setSolRpcUrl).
//
// The provider is untrusted for INTEGRITY — keys never leave the device and a
// lying RPC cannot forge a signature (I1/I5). But the override URL controls WHERE
// traffic goes: an unchecked `http://` to a remote host is a plaintext downgrade
// that leaks the wallet's addresses, and a credentialed/`file:`/`javascript:` URL
// is an exfiltration / request-shaping surface. That is an I2 concern (no silent
// egress), so the egress target is a controlled decision, not free-form input.
//
// Policy:
//   - `https://` to a well-known RPC/indexer host (see WELL_KNOWN_RPC_HOSTS).
//   - `https://` to ANY other host ONLY when the operator has explicitly opted
//     in via VITE_ALLOW_CUSTOM_RPC=1 at build time or the runtime override
//     `globalThis.__veyrnoxAllowCustomRpc === true` (settable by a
//     future consent-gated NetworkManager flow). Fails closed otherwise —
//     codex P2 2026-08-15: a compromised override/config path could
//     otherwise redirect balance and history traffic to an arbitrary TLS
//     endpoint. Cert pinning remains a TARGET-only follow-up.
//   - `http://` ONLY to loopback, so an operator can point at a local node
//     (http://localhost / 127.0.0.1 / [::1]).
//   - no embedded credentials; no other schemes.

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

// Curated list of hosts / suffixes for RPC + indexer providers the app ships
// with defaults from. Match is by exact host OR suffix (leading dot ensures
// `evil.infura.io` is NOT accepted just because `infura.io` is a suffix
// entry — a suffix must be preceded by a `.`). Trimmed to what the app
// actually calls today; extend when a new default provider is added.
const WELL_KNOWN_RPC_HOSTS = [
  // EVM
  '.infura.io', '.alchemy.com', '.g.alchemy.com', '.ankr.com', '.publicnode.com',
  '.quiknode.pro', '.cloudflare-eth.com', '.llamarpc.com', '.blastapi.io',
  '.drpc.org', '.gateway.tenderly.co', '.polygon-rpc.com', '.bnbchain.org',
  '.binance.org', '.optimism.io', '.arbitrum.io', '.avax.network',
  // Bitcoin (Esplora / Blockstream / mempool.space)
  '.blockstream.info', '.mempool.space',
  // Solana
  '.solana.com', '.helius-rpc.com', '.projectserum.com',
];

function isWellKnownRpcHost(host) {
  // Every entry starts with `.` — accept the bare host (suffix.slice(1)) or any
  // subdomain (host.endsWith(suffix)). The old `includes(host)` branch was dead
  // because no entry equals a bare host. Round-4 audit fix (2026-08-16).
  return WELL_KNOWN_RPC_HOSTS.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

function customRpcAllowed() {
  // Build-time opt-in (developer / CI decision).
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ALLOW_CUSTOM_RPC === '1') return true;
  } catch { /* import.meta not available in some test contexts */ }
  // Runtime opt-in (future consent-gated UI toggle).
  try {
    if (typeof globalThis !== 'undefined' && globalThis.__veyrnoxAllowCustomRpc === true) return true;
  } catch { /* no globalThis */ }
  return false;
}

/**
 * PURE: assert a user/operator-supplied RPC or indexer URL is safe to use as an
 * egress target. Returns the trimmed URL on success; throws on anything unsafe.
 * Extracted so the security-relevant policy is unit-testable without network.
 * @param {unknown} url
 * @returns {string} the validated, trimmed URL
 */
export function assertSafeRpcUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('RPC URL must be a non-empty string');
  }
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('RPC URL is not a valid URL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('RPC URL must not embed credentials');
  }
  // Codex P2 2026-08-15: reject URL fragments. Path and query are
  // deliberately allowed (Infura / Alchemy / etc. carry the project key
  // in the path, some providers in the query), but a `#…` fragment has
  // no meaning on an RPC endpoint — its presence indicates either a
  // paste error (browser-bar URL copied with an anchor) or an attempt
  // to slip a value past the store that some downstream parser might
  // reinterpret differently. Reject rather than silently strip so the
  // operator sees the malformed input.
  if (parsed.hash) {
    throw new Error('RPC URL must not contain a fragment (#…)');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (parsed.protocol === 'http:' && LOOPBACK.has(host)) return trimmed;
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `RPC URL must use https (http allowed only for loopback); got ${parsed.protocol}`,
    );
  }
  if (isWellKnownRpcHost(host)) return trimmed;
  if (customRpcAllowed()) return trimmed;
  throw new Error(
    `RPC host "${host}" is not in the well-known provider list. To use a custom RPC, set VITE_ALLOW_CUSTOM_RPC=1 at build time or set globalThis.__veyrnoxAllowCustomRpc = true at runtime.`,
  );
}

/**
 * Non-throwing variant for guarding a RENDERED external link (e.g. a user-supplied
 * block-explorer URL). Returns the validated URL, or null if the scheme is unsafe
 * (`javascript:`/`data:`/`file:`/remote `http:`). Use this to decide whether to
 * render an `<a href>`, so an unsafe scheme can never reach the DOM and execute.
 *
 * NOTE: this delegates to `assertSafeRpcUrl`, which enforces the RPC-host
 * allowlist. Callers rendering explorer URLs (not RPCs) should use
 * `safeExplorerUrl` instead — the allowlist does not contain explorer hosts,
 * so `safeExternalUrl` will reject every default network's explorer link
 * (etherscan.io, bscscan.com, snowtrace.io, …).
 * @param {unknown} url
 * @returns {string|null}
 */
export function safeExternalUrl(url) {
  try {
    return assertSafeRpcUrl(url);
  } catch {
    return null;
  }
}

/**
 * Non-throwing scheme + shape gate for RENDERED block-explorer URLs. Deliberately
 * has NO host allowlist (issue #1848): explorers are per-network and the RPC
 * allowlist doesn't (and shouldn't) enumerate them. Rejects everything the
 * shared RPC gate rejects except the host check:
 *   - non-string / empty
 *   - unparseable
 *   - embedded credentials (`user:pw@host`)
 *   - fragments (`#…` — same paste-error / smuggling reasoning as RPCs)
 *   - non-https except loopback http
 * Returns the trimmed URL on success, null on any rejection.
 *
 * Use this at the RENDER SITE for explorer URLs. Do NOT weaken
 * `assertSafeRpcUrl` to admit explorers — the shared validator's tight
 * allowlist is what stops arbitrary egress from a user-set custom RPC.
 * @param {unknown} url
 * @returns {string|null}
 */
export function safeExplorerUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.hash) return null;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (parsed.protocol === 'http:' && LOOPBACK.has(host)) return trimmed;
  if (parsed.protocol !== 'https:') return null;
  return trimmed;
}
