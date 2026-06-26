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
  // eth_signTypedData (v1) and _v3 use DIFFERENT encoding from v4 (v1: array of
  // {type,name,value}, no domain separator; v3: different encodeData for type refs).
  // Routing them to the v4 handler would sign a different hash than the user is shown,
  // so they are BLOCKED below rather than mapped to SIGN_TYPED_DATA (H6).
  eth_signTypedData_v4: REQUEST_TYPES.SIGN_TYPED_DATA,
  eth_sign: REQUEST_TYPES.ETH_SIGN,
  wallet_switchEthereumChain: REQUEST_TYPES.SWITCH_CHAIN,
  wallet_addEthereumChain: REQUEST_TYPES.ADD_CHAIN,
};

// Methods rejected immediately — never prompt the user.
// eth_signTypedData (v1) and _v3 are unsupported: their encoding diverges from v4,
// so signing under v4 semantics produces a hash the user never saw (H6).
export const BLOCKED_METHODS = new Set([
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain',
]);

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
