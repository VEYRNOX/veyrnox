// src/risk/knownBadDapps.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// The ONE local source of truth for the known-bad / phishing dApp domain list and
// the pure check over it. Mirrors wallet-core/evm/poison.js's LOCAL_FLAGGED
// pattern: LOCAL-ONLY (checking it leaks nothing off-device), illustrative and
// non-exhaustive, and it NEVER asserts a domain is "safe" — only that a domain is
// known bad. Intended to be hydrated from a real threat feed later and still stay
// local. No network, no keys, no React.

// Moved verbatim out of pages/DAppSecurityAlerts.jsx so the page and the
// WalletConnect connect/request flow share one list.
export const LOCAL_KNOWN_BAD = Object.freeze([
  Object.freeze({ domain: 'fakeswap-rewards.xyz', reason: 'Known phishing / wallet-drainer domain' }),
  Object.freeze({ domain: 'airdrop-claim2024.io', reason: 'Known approval-drainer / fake airdrop' }),
  Object.freeze({ domain: 'uniswap-app.org', reason: 'Look-alike of uniswap.org (typosquat)' }),
  Object.freeze({ domain: 'metamask-wallet.app', reason: 'Look-alike of metamask.io (credential phish)' }),
]);

const BAD_SET = new Map(LOCAL_KNOWN_BAD.map((b) => [b.domain.toLowerCase(), b]));

/**
 * Reduce an arbitrary URL/host input to a bare lowercase host: strips scheme,
 * a leading www., any path/query, and surrounding whitespace. Total: a non-string
 * or empty input yields ''.
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
}

/**
 * Check a dApp URL/domain against the LOCAL known-bad list. Pure + total: never
 * throws, never makes a network call, and never returns a "safe" verdict —
 * absence from the list is reported as flagged:false, which the caller must NOT
 * present as a safety guarantee.
 *
 * @param {unknown} url
 * @returns {{ domain: string, flagged: boolean, reason: string|null }}
 */
export function checkDappDomain(url) {
  const domain = normalizeDomain(url);
  if (!domain) return { domain: '', flagged: false, reason: null };
  // Exact match first.
  const exact = BAD_SET.get(domain);
  if (exact) return { domain, flagged: true, reason: exact.reason };

  // L5: parent-domain (suffix) walk. A subdomain of a known-bad domain is also
  // bad: app.knownbad.com matches knownbad.com. Strip one leading label at a
  // time and re-check. Stop before the final two labels would collapse to a
  // bare TLD — we never match on a shared TLD alone (that would over-match).
  const labels = domain.split('.');
  for (let i = 1; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join('.');
    const hit = BAD_SET.get(suffix);
    if (hit) return { domain, flagged: true, reason: hit.reason };
  }

  return { domain, flagged: false, reason: null };
}
