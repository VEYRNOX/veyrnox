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
//   - `https://` to any host (the normal case).
//   - `http://` ONLY to loopback, so an operator can point at a local node
//     (http://localhost / 127.0.0.1 / [::1]).
//   - no embedded credentials; no other schemes.

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

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
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (parsed.protocol === 'https:') return trimmed;
  if (parsed.protocol === 'http:' && LOOPBACK.has(host)) return trimmed;
  throw new Error(
    `RPC URL must use https (http allowed only for loopback); got ${parsed.protocol}`,
  );
}
