// TIP chain-slug mapping for the Send flow.
//
// The TIP Worker's per-source aggregators gate on the chain string
// (see veyrnox-tip src/lib/threat-sources/goplus.ts CHAIN_ID and
// etherscan-labels-kv.ts). A bare 'evm' silently skips the label matcher
// and GoPlus — issue #1645 was a live BLOCK verdict for a Tornado Cash
// address rendering as CLEAR because the Send flow sent 'evm' instead of
// the specific chain slug.
//
// Testnets map to their mainnet slug: OFAC / etherscan-labels lookups are
// address-based and the same seed sends on mainnet, so a testnet Send to a
// listed mainnet address should still warn. Unknown keys fall back to
// 'ethereum' — the safer default because it has the widest source coverage,
// and a wrong-slug false-negative is worse than a wrong-slug false-positive
// (which is unlikely: address hits are chain-agnostic in the OFAC feeds).

const EVM_NETWORK_TO_TIP_CHAIN = {
  mainnet: 'ethereum',
  sepolia: 'ethereum',
  polygon: 'polygon',
  polygonAmoy: 'polygon',
  arbitrum: 'arbitrum',
  arbitrumSepolia: 'arbitrum',
  optimism: 'optimism',
  optimismSepolia: 'optimism',
  avalanche: 'avalanche',
  avalancheFuji: 'avalanche',
  bnb: 'bsc',
  bnbTestnet: 'bsc',
};

/**
 * @param {'btc'|'solana'|null} family  Non-EVM family, if any.
 * @param {string|undefined} networkKey EVM asset.chain (e.g. 'mainnet', 'polygon').
 * @returns {string} TIP chain slug the Worker will actually route on.
 */
export function resolveTipChain(family, networkKey) {
  if (family === 'btc') return 'btc';
  if (family === 'solana') return 'solana';
  return EVM_NETWORK_TO_TIP_CHAIN[networkKey] || 'ethereum';
}
