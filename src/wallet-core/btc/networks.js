// wallet-core/btc/networks.js
//
// Bitcoin network registry. A SEPARATE stack from the EVM family (see
// docs/PhaseBTC.md): UTXO model, bech32 addresses, its own testnet/signet.
// Mirrors the EVM `networks.js` discipline exactly so the safety properties are
// identical and obvious to a reviewer:
//
//   - mainnet is the active network (ACTIVE_BTC_NETWORK_KEY), unlocked after the
//     internal security audit + owner sign-off (2026-06-17); it still requires
//     ALLOW_BTC_MAINNET so real BTC cannot move while that gate is false.
//   - testnet (testnet3) and signet remain enabled testnet-class (real-funds-free)
//     networks for verification and derivation testing.
//
// SECURITY RATIONALE
//   - The indexer/Esplora endpoint is UNTRUSTED infrastructure (reads +
//     broadcast only). Keys never leave the device; signing is local. A lying
//     indexer can withhold UTXOs or refuse a broadcast, but cannot forge a
//     signature or move funds. Same rule as the EVM RPC.
//   - `bech32` HRP is the consensus-critical address discriminator: `tb` for
//     testnet AND signet, `bc` for mainnet. A wrong HRP would derive a wallet
//     on the wrong network — treated with the same care as an EVM chainId.
//   - testnet and signet SHARE the same address format and BIP-84 coin type
//     (1'), so derivation is identical for both; only the indexer differs.
//
// Address params map onto @scure/btc-signer's BTC_NETWORK shape
// ({ bech32, pubKeyHash, scriptHash, wif }) so a network entry can be handed
// straight to the signer without translation.

// @scure/btc-signer's canonical network parameter sets. We re-export the exact
// objects it ships (rather than hand-rolling version bytes) so address encoding
// and WIF are guaranteed consistent with the audited library.
import { NETWORK as BTC_MAINNET_PARAMS, TEST_NETWORK as BTC_TEST_PARAMS } from '@scure/btc-signer';

export const BTC_NETWORKS = {
  // ---- testnet3 (verification / real-funds-free) ----
  testnet: {
    key: 'testnet',
    name: 'Bitcoin Testnet',
    // BIP-84 coin type for ALL Bitcoin testnets is 1' (not 0'). Mainnet is 0'.
    coinType: 1,
    // bech32 HRP `tb` -> tb1q… addresses. Shared with signet.
    params: BTC_TEST_PARAMS,
    addressPrefix: 'tb1',
    // Untrusted Esplora-compatible indexer. Overridable via setEsploraUrl().
    defaultEsploraUrl: 'https://mempool.space/testnet/api',
    explorer: 'https://mempool.space/testnet',
    isTestnet: true,
    enabled: true,
  },

  // ---- signet (more stable than testnet3; same address format) ----
  signet: {
    key: 'signet',
    name: 'Bitcoin Signet',
    coinType: 1,
    params: BTC_TEST_PARAMS, // signet uses the testnet address format (tb1…)
    addressPrefix: 'tb1',
    defaultEsploraUrl: 'https://mempool.space/signet/api',
    explorer: 'https://mempool.space/signet',
    isTestnet: true,
    enabled: true,
  },

  // ---- mainnet (ACTIVE; gated by ALLOW_BTC_MAINNET) ----
  mainnet: {
    key: 'mainnet',
    name: 'Bitcoin Mainnet',
    coinType: 0,
    params: BTC_MAINNET_PARAMS, // bc1q… addresses
    addressPrefix: 'bc1',
    defaultEsploraUrl: 'https://mempool.space/api',
    explorer: 'https://mempool.space',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },
};

// Master switch, mirroring EVM's ALLOW_MAINNET. Even if a network's `enabled`
// were true, mainnet ALSO requires this.
// Flipped true: 2026-06-17 — owner sign-off after internal security audit
// (docs/audit-triage/internal-audit-2026-06-17.md). 0 crit/high/med findings.
export const ALLOW_BTC_MAINNET = true;

/**
 * Display-only lookup. Returns the raw entry (or null) WITHOUT the mainnet gate,
 * so the UI can render a network's name / explorer / address prefix. NEVER use
 * this to obtain an endpoint for reads or broadcast — that path must go through
 * getBtcNetwork(), which enforces the gate.
 */
export function getBtcNetworkInfo(key) {
  return BTC_NETWORKS[key] || null;
}

/**
 * Gated accessor. Throws for mainnet (until ALLOW_BTC_MAINNET) and for any
 * disabled network — the financial safety gate, identical in spirit to the EVM
 * getNetwork().
 */
export function getBtcNetwork(key) {
  const net = BTC_NETWORKS[key];
  if (!net) throw new Error(`Unknown Bitcoin network: ${key}`);
  if (!net.isTestnet && !ALLOW_BTC_MAINNET) {
    throw new Error('Bitcoin mainnet is gated. Set ALLOW_BTC_MAINNET=true only after the security audit and a verified testnet send.');
  }
  if (!net.enabled) {
    throw new Error(`Bitcoin network "${key}" is not enabled.`);
  }
  return net;
}

export function listEnabledBtcNetworks() {
  return Object.values(BTC_NETWORKS).filter(n => n.enabled && (n.isTestnet || ALLOW_BTC_MAINNET));
}

// The network key the shipped BTC asset actually runs on. Mirrors assets.js
// (`{ symbol: 'BTC', chain: 'mainnet' }`) and btc/derivation.js's default
// (`networkKey='mainnet'`): the wallet derives, reads, and signs on mainnet
// (ALLOW_BTC_MAINNET = true since 2026-06-17).
// Single source of truth for "which BTC network is active".
export const ACTIVE_BTC_NETWORK_KEY = 'mainnet';

/**
 * The @scure/btc-signer params for the ACTIVE BTC network (mainnet). Use this when a
 * caller must validate/encode against the network the wallet is actually on, rather
 * than the broader enabled-network set.
 * This does NOT touch the gate — it only answers "active params".
 */
export function getActiveBtcParams() {
  return BTC_NETWORKS[ACTIVE_BTC_NETWORK_KEY].params;
}
