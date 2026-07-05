// src/risk/knownBadDapps.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
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
  // Additional entries below: still non-exhaustive and illustrative. Drawn from
  // patterns reported to public anti-phishing feeds (MetaMask eth-phishing-detect,
  // Chainabuse, Scam Sniffer) for common wallet-drainer / seed-phrase-phishing
  // and brand-typosquat shapes. Absence from this list NEVER implies "safe".
  Object.freeze({ domain: 'metamask-io.com', reason: 'Look-alike of metamask.io (seed-phrase phishing)' }),
  Object.freeze({ domain: 'metamask-login.com', reason: 'Fake MetaMask login (credential / seed phish)' }),
  Object.freeze({ domain: 'wallet-connect.org', reason: 'Look-alike of walletconnect.com (drainer landing)' }),
  Object.freeze({ domain: 'walletconnect-app.com', reason: 'Look-alike of walletconnect.com (typosquat)' }),
  Object.freeze({ domain: 'pancake-swap.finance', reason: 'Look-alike of pancakeswap.finance (typosquat)' }),
  Object.freeze({ domain: 'opensea-nft.io', reason: 'Look-alike of opensea.io (NFT approval drainer)' }),
  Object.freeze({ domain: 'blur-airdrop.io', reason: 'Fake Blur airdrop (approval drainer)' }),
  Object.freeze({ domain: 'arbitrum-airdrop.net', reason: 'Fake Arbitrum airdrop claim (drainer)' }),
  Object.freeze({ domain: 'optimism-airdrop.org', reason: 'Fake Optimism airdrop claim (drainer)' }),
  Object.freeze({ domain: 'zksync-airdrop.org', reason: 'Fake zkSync airdrop claim (drainer)' }),
  Object.freeze({ domain: 'starknet-claim.com', reason: 'Fake Starknet claim (drainer)' }),
  Object.freeze({ domain: 'ledger-live.app', reason: 'Look-alike of ledger.com (seed-phrase phishing)' }),
  Object.freeze({ domain: 'ledger-restore.com', reason: 'Fake Ledger recovery (seed-phrase theft)' }),
  Object.freeze({ domain: 'trezor-wallet.io', reason: 'Look-alike of trezor.io (seed-phrase phishing)' }),
  Object.freeze({ domain: 'claim-rewards.app', reason: 'Generic fake rewards claim (approval drainer)' }),
  Object.freeze({ domain: 'token-airdrop.net', reason: 'Generic fake airdrop (approval drainer)' }),
  Object.freeze({ domain: 'connect-wallet.app', reason: 'Generic fake wallet-connect prompt (drainer)' }),
  Object.freeze({ domain: 'lido-staking.org', reason: 'Look-alike of lido.fi staking (drainer)' }),
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
