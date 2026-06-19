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

// chainId / symbol / explorer for every entry below were VERIFIED against the
// authoritative ethereum-lists/chains registry (the data Chainlist serves),
// cross-checked per-chain — never guessed. A wrong chainId is consensus-critical
// (wrong-network sends / replay), so it is treated with the same discipline as a
// token address in Phase B. Sources (eip155-<id>.json):
//   sepolia 11155111 · polygonAmoy 80002 · arbitrumSepolia 421614 ·
//   optimismSepolia 11155420 · avalancheFuji 43113 · bnbTestnet 97 ·
//   mainnet 1 · polygon 137 · arbitrum 42161 · optimism 10 · avalanche 43114 · bnb 56
//
// GAS TOKEN IS NOT ALWAYS ETH (Phase C gotcha #1): Arbitrum/Optimism pay gas in
// ETH, but Polygon=POL, Avalanche=AVAX, BNB=BNB (testnet faucet token tBNB). The
// `symbol` here is the single source of truth the UI must use for fees/balances —
// nothing downstream may hardcode "ETH".
export const NETWORKS = {
  // ---- Ethereum ----
  sepolia: {
    key: 'sepolia',
    name: 'Sepolia Testnet',
    chainId: 11155111,
    symbol: 'ETH',
    decimals: 18,
    // Public default; override via setRpcUrl(). Swap for your own provider in prod.
    // (rpc.sepolia.org was returning 404; publicnode is a reliable public default.)
    defaultRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
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
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },

  // ---- Polygon (gas token: POL, formerly MATIC — NOT ETH) ----
  polygonAmoy: {
    key: 'polygonAmoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    symbol: 'POL',
    decimals: 18,
    defaultRpcUrl: 'https://rpc-amoy.polygon.technology',
    explorer: 'https://amoy.polygonscan.com',
    isTestnet: true,
    enabled: true,
  },
  polygon: {
    key: 'polygon',
    name: 'Polygon Mainnet',
    chainId: 137,
    symbol: 'POL',
    decimals: 18,
    defaultRpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorer: 'https://polygonscan.com',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },

  // ---- Arbitrum (L2; gas token: ETH) ----
  arbitrumSepolia: {
    key: 'arbitrumSepolia',
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    symbol: 'ETH',
    decimals: 18,
    defaultRpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    isTestnet: true,
    enabled: true,
  },
  arbitrum: {
    key: 'arbitrum',
    name: 'Arbitrum One',
    chainId: 42161,
    symbol: 'ETH',
    decimals: 18,
    defaultRpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    explorer: 'https://arbiscan.io',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },

  // ---- Optimism (L2; gas token: ETH) ----
  optimismSepolia: {
    key: 'optimismSepolia',
    name: 'OP Sepolia',
    chainId: 11155420,
    symbol: 'ETH',
    decimals: 18,
    defaultRpcUrl: 'https://sepolia.optimism.io',
    explorer: 'https://sepolia-optimism.etherscan.io',
    isTestnet: true,
    enabled: true,
  },
  optimism: {
    key: 'optimism',
    name: 'OP Mainnet',
    chainId: 10,
    symbol: 'ETH',
    decimals: 18,
    defaultRpcUrl: 'https://optimism-rpc.publicnode.com',
    explorer: 'https://optimistic.etherscan.io',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },

  // ---- Avalanche C-Chain (gas token: AVAX — NOT ETH) ----
  avalancheFuji: {
    key: 'avalancheFuji',
    name: 'Avalanche Fuji',
    chainId: 43113,
    symbol: 'AVAX',
    decimals: 18,
    defaultRpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorer: 'https://testnet.snowtrace.io',
    isTestnet: true,
    enabled: true,
  },
  avalanche: {
    key: 'avalanche',
    name: 'Avalanche C-Chain',
    chainId: 43114,
    symbol: 'AVAX',
    decimals: 18,
    defaultRpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
    explorer: 'https://snowtrace.io',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
  },

  // ---- BNB Smart Chain (gas token: BNB; testnet faucet token tBNB — NOT ETH) ----
  bnbTestnet: {
    key: 'bnbTestnet',
    name: 'BNB Smart Chain Testnet',
    chainId: 97,
    symbol: 'tBNB', // authoritative testnet native symbol (mainnet is BNB)
    decimals: 18,
    defaultRpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
    explorer: 'https://testnet.bscscan.com',
    isTestnet: true,
    enabled: true,
    // BSC enforces a network-level minimum gas price (~1 gwei). On EIP-1559 where
    // baseFee≈0, effective price≈tip, so the Slow tier (tip×½) can underprice and
    // be silently rejected by BSC nodes. buildEvmTiers floors all tiers against this.
    minGasPriceWei: '1000000000', // 1 gwei
  },
  bnb: {
    key: 'bnb',
    name: 'BNB Smart Chain',
    chainId: 56,
    symbol: 'BNB',
    decimals: 18,
    defaultRpcUrl: 'https://bsc-rpc.publicnode.com',
    explorer: 'https://bscscan.com',
    isTestnet: false,
    enabled: true, // unlocked 2026-06-17 owner sign-off
    minGasPriceWei: '1000000000', // 1 gwei — same enforcement on BSC mainnet
  },
};

// Master switch. Even if a network's `enabled` is true, mainnet also requires
// this to be explicitly turned on.
// Flipped true: 2026-06-17 — owner sign-off after internal security audit
// (docs/audit-triage/internal-audit-2026-06-17.md). 0 crit/high/med findings.
export const ALLOW_MAINNET = true;

/**
 * Display-only lookup. Returns the raw network entry (or null) WITHOUT applying
 * the mainnet-gate / enabled throw, so the UI can show a chain's name, native
 * `symbol`, and explorer for fee/balance labels.
 *
 * SECURITY: never use this to obtain an RPC for reads or broadcast — that path
 * must go through getNetwork()/getProvider(), which enforce the gate. This is
 * purely for rendering the correct native gas symbol per chain (no hardcoded ETH).
 */
export function getNetworkInfo(key) {
  return NETWORKS[key] || null;
}

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
