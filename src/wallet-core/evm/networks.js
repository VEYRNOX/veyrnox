// wallet-core/evm/networks.js
//
// EVM network registry. Sepolia (testnet) is the default and the only
// network enabled for real use until the security audit clears. Mainnet is
// present but GATED behind an explicit flag so real funds cannot move by
// accident before audit.
//
// SECURITY RATIONALE
//   - Defaulting to testnet means a launch can happen openly with ZERO
//     real-funds risk. Flipping to mainnet post-audit is a config change,
//     not a code change.
//   - chainId is verified at signing time (see signing.js) to prevent
//     wrong-network / replay mistakes.
//   - RPC URLs: a sane public default is provided, but users may override.
//     The RPC is NEVER trusted for anything security-critical — keys are
//     local, signing is local; RPC is used only to read state and broadcast.

export const NETWORKS = {
  sepolia: {
    key: 'sepolia',
    name: 'Sepolia Testnet',
    chainId: 11155111,
    symbol: 'ETH',
    decimals: 18,
    // Public default; override via setRpcUrl(). Swap for your own provider in prod.
    defaultRpcUrl: 'https://rpc.sepolia.org',
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    enabled: true,
  },
  mainnet: {
    key: 'mainnet',
    name: 'Ethereum Mainnet',
    chainId: 1,
    symbol: 'ETH',
    decimals: 18,
    defaultRpcUrl: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io',
    isTestnet: false,
    // GATED: stays false until the audit clears. Do not flip without sign-off.
    enabled: false,
  },
};

// Master switch. Even if a network's `enabled` is true, mainnet also requires
// this to be explicitly turned on. Keep false until audit + verification done.
export const ALLOW_MAINNET = false;

export function getNetwork(key) {
  const net = NETWORKS[key];
  if (!net) throw new Error(`Unknown network: ${key}`);
  if (!net.isTestnet && !ALLOW_MAINNET) {
    throw new Error('Mainnet is gated. Set ALLOW_MAINNET=true only after the security audit and crypto-path verification are complete.');
  }
  if (!net.enabled) {
    throw new Error(`Network "${key}" is not enabled.`);
  }
  return net;
}

export function listEnabledNetworks() {
  return Object.values(NETWORKS).filter(n => n.enabled && (n.isTestnet || ALLOW_MAINNET));
}
