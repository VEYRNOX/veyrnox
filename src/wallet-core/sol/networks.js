// wallet-core/sol/networks.js
//
// Solana network registry. A SEPARATE stack from EVM and BTC (see
// docs/PhaseSOL.md): ed25519 keys, base58 addresses, account model with rent,
// blockhash-bounded transactions. Mirrors the EVM/BTC `networks.js` gate
// discipline EXACTLY so the safety properties are identical and obvious to a
// reviewer:
//
//   - devnet is the default and the network used for app testing (Solana's
//     "devnet" is the faucet-funded development network; "testnet" also exists
//     and is real-funds-free). Both are enabled.
//   - mainnet-beta is present but GATED behind ALLOW_SOL_MAINNET so real SOL
//     cannot move by accident before audit + a verified devnet send. Mirrors
//     ALLOW_BTC_MAINNET / EVM ALLOW_MAINNET.
//
// SECURITY RATIONALE
//   - The JSON-RPC endpoint is UNTRUSTED infrastructure (reads + broadcast
//     only). Keys never leave the device; signing is local (see send.js). A
//     lying RPC can withhold a balance, inflate a fee, or refuse a broadcast,
//     but cannot forge an ed25519 signature or move funds. Same rule as the EVM
//     RPC and the BTC indexer.
//   - The endpoint is overridable so an operator can point at their own RPC
//     instead of the public one.

export const SOL_NETWORKS = {
  // ---- devnet (default; faucet-funded development network) ----
  devnet: {
    key: 'devnet',
    name: 'Solana Devnet',
    cluster: 'devnet',
    // Untrusted public RPC. Overridable via setSolRpcUrl(). Falls back through
    // the list in order when the primary is rate-limited or unreachable — all
    // carry the same security posture (reads + broadcast only, keys stay local).
    defaultRpcUrl: 'https://api.devnet.solana.com',
    fallbackRpcUrls: [
      'https://devnet.helius-rpc.com/?api-key=public',
      'https://rpc.ankr.com/solana_devnet',
    ],
    // Explorer links carry the cluster query so they resolve to devnet.
    explorer: 'https://explorer.solana.com',
    explorerCluster: 'devnet',
    isTestnet: true,
    enabled: true,
  },

  // ---- testnet (validator test network; also real-funds-free) ----
  testnet: {
    key: 'testnet',
    name: 'Solana Testnet',
    cluster: 'testnet',
    defaultRpcUrl: 'https://api.testnet.solana.com',
    explorer: 'https://explorer.solana.com',
    explorerCluster: 'testnet',
    isTestnet: true,
    enabled: true,
  },

  // ---- mainnet-beta (GATED) ----
  mainnet: {
    key: 'mainnet',
    name: 'Solana Mainnet',
    cluster: 'mainnet-beta',
    defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
    explorer: 'https://explorer.solana.com',
    explorerCluster: null, // mainnet needs no cluster query param
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },
};

// Master switch, mirroring ALLOW_BTC_MAINNET / EVM's ALLOW_MAINNET. Even if a
// network's `enabled` were true, mainnet ALSO requires this.
// Flipped true: 2026-06-17 — owner sign-off after internal security audit
// (docs/audit-triage/internal-audit-2026-06-17.md). 0 crit/high/med findings.
export const ALLOW_SOL_MAINNET = true;

/**
 * Display-only lookup. Returns the raw entry (or null) WITHOUT the mainnet gate,
 * so the UI can render a network's name / explorer / cluster. NEVER use this to
 * obtain an endpoint for reads or broadcast — that path must go through
 * getSolNetwork(), which enforces the gate.
 */
export function getSolNetworkInfo(key) {
  return SOL_NETWORKS[key] || null;
}

/**
 * Gated accessor. Throws for mainnet (until ALLOW_SOL_MAINNET) and for any
 * disabled network — the financial safety gate, identical in spirit to
 * getBtcNetwork() / the EVM getNetwork().
 */
export function getSolNetwork(key) {
  const net = SOL_NETWORKS[key];
  if (!net) throw new Error(`Unknown Solana network: ${key}`);
  if (!net.isTestnet && !ALLOW_SOL_MAINNET) {
    throw new Error('Solana mainnet is gated. Set ALLOW_SOL_MAINNET=true only after the security audit and a verified devnet send.');
  }
  if (!net.enabled) {
    throw new Error(`Solana network "${key}" is not enabled.`);
  }
  return net;
}

export function listEnabledSolNetworks() {
  return Object.values(SOL_NETWORKS).filter(n => n.enabled && (n.isTestnet || ALLOW_SOL_MAINNET));
}

/**
 * Build an explorer URL for a tx/address on a network, with the cluster query
 * appended for non-mainnet clusters (devnet/testnet need it; mainnet doesn't).
 * @param {string} networkKey
 * @param {string} kind - 'tx' | 'address'
 * @param {string} id   - signature or address
 */
export function solExplorerUrl(networkKey, kind, id) {
  const net = getSolNetworkInfo(networkKey);
  if (!net) return '';
  const q = net.explorerCluster ? `?cluster=${net.explorerCluster}` : '';
  return `${net.explorer}/${kind}/${id}${q}`;
}
