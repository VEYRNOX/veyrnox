// src/risk/knownBadDapps.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// The ONE local source of truth for the known-bad / phishing dApp domain list and
// the pure check over it. Mirrors wallet-core/evm/poison.js's LOCAL_FLAGGED
// pattern: LOCAL-ONLY (checking it leaks nothing off-device), illustrative and
// non-exhaustive, and it NEVER asserts a domain is "safe" — only that a domain is
// known bad. No network, no keys, no React.
//
// The "hydrated from a real threat feed later" part is now real: phishingFeed.js
// downloads a domain list, caches it in IndexedDB and REGISTERS itself here via
// setFeedLookup(). The dependency is one-way — phishingFeed imports this module,
// never the reverse — so there is no import cycle and this file stays free of
// network code. If the feed never registers (not initialised, no URL configured,
// fetch failed), checkDappDomain behaves exactly as it did before: local seed
// only. The domain being checked is still matched entirely on-device (I2).

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
 * An optional second list, registered by phishingFeed.js once it has data.
 * Takes an ALREADY-normalized domain and returns a reason string, or null.
 * @type {((domain: string) => string|null) | null}
 */
let _feedLookup = null;

/**
 * Register (or with null, unregister) the live-feed lookup. Called by
 * phishingFeed.initPhishingFeed(); nothing else should call it. Kept as
 * injection rather than an import so this module never depends on the network
 * layer and the two files cannot form an import cycle.
 * @param {((domain: string) => string|null) | null} fn
 */
export function setFeedLookup(fn) {
  _feedLookup = typeof fn === 'function' ? fn : null;
}

/**
 * Check a dApp URL/domain against the live feed (when registered) AND the local
 * known-bad list. Pure + total: never throws, never makes a network call at
 * check time, and never returns a "safe" verdict — absence from both lists is
 * reported as flagged:false, which the caller must NOT present as a safety
 * guarantee. `source` names which list matched, for provenance in the UI.
 *
 * @param {unknown} url
 * @returns {{ domain: string, flagged: boolean, reason: string|null, source: 'feed'|'local'|null }}
 */
export function checkDappDomain(url) {
  const domain = normalizeDomain(url);
  if (!domain) return { domain: '', flagged: false, reason: null, source: null };

  // L5: parent-domain (suffix) walk. A subdomain of a known-bad domain is also
  // bad: app.knownbad.com matches knownbad.com. Strip one leading label at a
  // time and re-check. Stop before the final two labels would collapse to a
  // bare TLD — we never match on a shared TLD alone (that would over-match).
  const labels = domain.split('.');
  /** @type {string[]} */
  const candidates = [domain];
  for (let i = 1; i < labels.length - 1; i++) candidates.push(labels.slice(i).join('.'));

  // Feed first — it is the more current of the two. A throwing or missing feed
  // must never take the local seed down with it, hence the try/catch around the
  // injected function only.
  if (_feedLookup) {
    try {
      for (const c of candidates) {
        const reason = _feedLookup(c);
        if (reason) return { domain, flagged: true, reason, source: 'feed' };
      }
    } catch { /* feed lookup is best-effort; fall through to the local seed */ }
  }

  for (const c of candidates) {
    const hit = BAD_SET.get(c);
    if (hit) return { domain, flagged: true, reason: hit.reason, source: 'local' };
  }

  return { domain, flagged: false, reason: null, source: null };
}
