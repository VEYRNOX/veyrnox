// wallet-core/assets.js
//
// Single source of truth for the 10 assets shown in the UI AND for what each
// is actually allowed to do. Status drives BOTH display and capability:
//
//   live         - real keys + signing/broadcast; SEND allowed
//   receive_only - real address derivation; can receive/show balance; NO send
//   coming_soon  - roadmap placeholder; NO address shown; NO send, NO receive
//
// SECURITY RATIONALE
// The original codebase showed 10 wallets that all "worked" but were fake —
// a user could send to a fabricated address. Here all 10 remain visible, but
// `canSend()` is a HARD gate the send flow must honor, and `coming_soon`
// assets never render an address. Flipping an asset to `live` is a deliberate,
// one-line change made only after that asset's crypto path is verified.

export const ASSET_STATUS = Object.freeze({
  LIVE: 'live',
  RECEIVE_ONLY: 'receive_only',
  COMING_SOON: 'coming_soon',
});

// family determines which derivation/signing stack an asset uses.
//   evm    - native coin on an EVM chain (secp256k1, m/44'/60')
//   erc20  - token on an EVM chain (same keys; contract-call send path)
//   btc    - Bitcoin (separate: bech32, UTXO, PSBT)
//   solana - Solana (separate: ed25519, base58)
export const ASSETS = Object.freeze([
  { symbol: 'ETH',   name: 'Ethereum',  family: 'evm',    chain: 'sepolia',   status: ASSET_STATUS.LIVE },
  // USDC (Phase B): real address + live balance reads are wired and verified
  // (Circle's official Sepolia USDC). Send stays HARD-gated at receive_only
  // until a testnet transfer is verified on-chain and reviewed, then flip to
  // LIVE. See src/wallet-core/evm/tokens.js.
  { symbol: 'USDC',  name: 'USD Coin',  family: 'erc20',  chain: 'sepolia',   status: ASSET_STATUS.RECEIVE_ONLY },
  // USDT (Phase B): no authoritative Tether deployment exists on Sepolia, so the
  // token address is intentionally unconfigured (tokens.js) and USDT stays
  // coming_soon — no address, no balance, no send — until a verified address is
  // supplied. We do not guess token addresses.
  { symbol: 'USDT',  name: 'Tether',    family: 'erc20',  chain: 'sepolia',   status: ASSET_STATUS.COMING_SOON },
  { symbol: 'MATIC', name: 'Polygon',   family: 'evm',    chain: 'polygon',   status: ASSET_STATUS.COMING_SOON },
  { symbol: 'ARB',   name: 'Arbitrum',  family: 'evm',    chain: 'arbitrum',  status: ASSET_STATUS.COMING_SOON },
  { symbol: 'OP',    name: 'Optimism',  family: 'evm',    chain: 'optimism',  status: ASSET_STATUS.COMING_SOON },
  { symbol: 'AVAX',  name: 'Avalanche', family: 'evm',    chain: 'avalanche', status: ASSET_STATUS.COMING_SOON },
  { symbol: 'BNB',   name: 'BNB Chain', family: 'evm',    chain: 'bsc',       status: ASSET_STATUS.COMING_SOON },
  { symbol: 'BTC',   name: 'Bitcoin',   family: 'btc',    chain: 'bitcoin',   status: ASSET_STATUS.COMING_SOON },
  { symbol: 'SOL',   name: 'Solana',    family: 'solana', chain: 'solana',    status: ASSET_STATUS.COMING_SOON },
]);

export function getAsset(symbol) {
  return ASSETS.find(a => a.symbol === symbol) || null;
}

/** HARD capability gate: only `live` assets may send. The send flow MUST check this. */
export function canSend(asset) {
  return !!asset && asset.status === ASSET_STATUS.LIVE;
}

/** Receiving / showing a real address is allowed for live and receive_only. */
export function canReceive(asset) {
  return !!asset && asset.status !== ASSET_STATUS.COMING_SOON;
}

/** EVM-family assets (evm + erc20) share one derived address. */
export function isEvmFamily(asset) {
  return !!asset && (asset.family === 'evm' || asset.family === 'erc20');
}
