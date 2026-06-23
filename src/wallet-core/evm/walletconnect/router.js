// Classify incoming WalletConnect session request methods.
// Pure — no keys, no network, no React.

export const REQUEST_TYPES = {
  SEND_TRANSACTION: 'send_transaction',
  PERSONAL_SIGN: 'personal_sign',
  SIGN_TYPED_DATA: 'sign_typed_data',
  ETH_SIGN: 'eth_sign',       // BLOCKED — raw arbitrary bytes, too dangerous
  SWITCH_CHAIN: 'switch_chain',
  ADD_CHAIN: 'add_chain',      // BLOCKED — arbitrary RPC injection
  UNKNOWN: 'unknown',
};

const METHOD_MAP = {
  eth_sendTransaction: REQUEST_TYPES.SEND_TRANSACTION,
  personal_sign: REQUEST_TYPES.PERSONAL_SIGN,
  eth_signTypedData: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_signTypedData_v3: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_signTypedData_v4: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_sign: REQUEST_TYPES.ETH_SIGN,
  wallet_switchEthereumChain: REQUEST_TYPES.SWITCH_CHAIN,
  wallet_addEthereumChain: REQUEST_TYPES.ADD_CHAIN,
};

// Methods rejected immediately — never prompt the user
export const BLOCKED_METHODS = new Set(['eth_sign', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);

export function classifyRequest(method) {
  return METHOD_MAP[method] ?? REQUEST_TYPES.UNKNOWN;
}

export function isBlocked(method) {
  return BLOCKED_METHODS.has(method);
}

// CAIP-2 chain IDs Veyrnox supports. Mirrors the networks in evm/networks.js.
export const SUPPORTED_CHAIN_IDS = new Set([
  11155111,  // Sepolia
  80002,     // Polygon Amoy
  421614,    // Arbitrum Sepolia
  11155420,  // OP Sepolia
  43113,     // Avalanche Fuji
  97,        // BNB Testnet
  1,         // Ethereum Mainnet
  137,       // Polygon
  42161,     // Arbitrum One
  10,        // Optimism
  43114,     // Avalanche C-Chain
  56,        // BNB Chain
]);
