// wallet-core/evm/tokens.js
//
// Per-chain ERC-20 token registry (Phase B).
//
// SECURITY RATIONALE
//   - `address` and `decimals` are CONSENSUS-CRITICAL. A wrong address sends to
//     the wrong contract; a wrong `decimals` silently scales the amount by
//     10^n. Both are verified, never guessed:
//       * address: sourced from the issuer's official docs and cross-checked on
//         a block explorer.
//       * decimals: pinned here AND re-checked against the on-chain `decimals()`
//         at read/send time (see token-send.js) — a mismatch throws.
//   - Mainnet entries added 2026-06-17 after owner sign-off (ALLOW_MAINNET = true)
//     and internal audit completion.

// USDC on Sepolia — Circle's official testnet deployment (a verified
// FiatTokenProxy, © Circle Internet Financial). Verified three ways:
//   - Circle docs:   https://developers.circle.com/stablecoins/usdc-contract-addresses
//   - Etherscan:     https://sepolia.etherscan.io/token/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
//   - On-chain:      name=USDC, symbol=USDC, decimals=6
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

// USDT on Sepolia — Tether-issued STAND-IN (Aave faucet test token).
//   Tether publishes NO official USDT on Sepolia, so there is no Tether-issued
//   address to verify against. Per policy we do NOT invent or guess one. Instead
//   we use the authoritative, faucet-mintable test-USDT from the Aave ecosystem:
//   a verified `TestnetERC20` deployed as USDT with the CORRECT 6 decimals — the
//   same role USDC's official Sepolia deployment plays. Verified three ways:
//     - Aave address book: USDT_UNDERLYING in bgd-labs/aave-address-book
//       https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3Sepolia.sol
//     - Etherscan (verified source, TestnetERC20): name=USDT, symbol=USDT, decimals=6
//       https://sepolia.etherscan.io/token/0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
//     - On-chain decimals() is re-checked at read/send time (token-send.js).
//   It is a TESTNET stand-in, not Tether's own contract — labelled as such and
//   faucet-mintable (https://gho.aave.com/faucet/) so a real testnet send can be
//   hand-verified before flipping USDT to live.
const SEPOLIA_USDT = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';

// USDC on Ethereum Mainnet — Circle's official deployment (FiatTokenProxy).
// Verified: https://developers.circle.com/stablecoins/usdc-contract-addresses
// Cross-checked on Etherscan: name=USD Coin, symbol=USDC, decimals=6
const MAINNET_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// USDT on Ethereum Mainnet — Tether's official deployment (TetherToken).
// Verified: https://tether.to/en/transparency/
// Cross-checked on Etherscan: name=Tether USD, symbol=USDT, decimals=6
const MAINNET_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

export const TOKENS = {
  sepolia: {
    USDC: { address: SEPOLIA_USDC, decimals: 6, symbol: 'USDC' },
    USDT: { address: SEPOLIA_USDT, decimals: 6, symbol: 'USDT' },
  },
  // Mainnet entries added 2026-06-17 after owner sign-off (ALLOW_MAINNET = true).
  mainnet: {
    USDC: { address: MAINNET_USDC, decimals: 6, symbol: 'USDC' },
    USDT: { address: MAINNET_USDT, decimals: 6, symbol: 'USDT' },
  },
};

/**
 * Resolve a token's registry entry, refusing anything not configured/verified.
 * @returns {{ address: string, decimals: number, symbol: string }}
 */
export function getToken(networkKey, symbol) {
  const t = TOKENS[networkKey]?.[symbol];
  if (!t) throw new Error(`Unknown token ${symbol} on ${networkKey}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(t.address)) {
    throw new Error(`Token ${symbol} address not configured/verified for ${networkKey}`);
  }
  return t;
}

/** True if a token is configured with a verified-format address (safe to use). */
export function isTokenConfigured(networkKey, symbol) {
  const t = TOKENS[networkKey]?.[symbol];
  return !!t && /^0x[0-9a-fA-F]{40}$/.test(t.address);
}

// Minimal ABI — only the functions we use. Keeping the surface small limits the
// calldata shapes the decoder (calldata.js) must reason about before signing.
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];
