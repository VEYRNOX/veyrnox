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
  // USDT: routes through the SAME ERC-20 path as USDC. Tether ships no official
  // Sepolia deployment, so we use the authoritative Aave faucet test-USDT as a
  // verified 6-decimal stand-in (see evm/tokens.js). Real address + live balance
  // reads + receive are wired now (receive_only); decimals (6) are pinned and
  // re-checked on-chain. SEND stays HARD-gated until a real testnet transfer is
  // verified on-chain and reviewed, then flip to LIVE — same discipline as USDC.
  { symbol: 'USDT',  name: 'Tether',    family: 'erc20',  chain: 'sepolia',   status: ASSET_STATUS.RECEIVE_ONLY },
  // Phase C: five EVM chains added on their TESTNETS, behind the mainnet gate.
  // Each shares the SAME secp256k1 / m/44'/60'/0'/0/0 address as ETH, so the
  // address derivation + live per-chain balance reads are wired now (receive_only).
  // `chain` points at the verified TESTNET network key (mainnets stay gated in
  // networks.js). SEND stays HARD-gated until a real testnet transfer on THAT
  // chain is verified on-chain and reviewed — only then does it flip to LIVE.
  // NOTE: gas/native token differs per chain (Polygon=POL, Avalanche=AVAX,
  // BNB=tBNB, but Arbitrum/Optimism=ETH); the UI reads that from networks.js.
  { symbol: 'MATIC', name: 'Polygon',   family: 'evm',    chain: 'polygonAmoy',     status: ASSET_STATUS.RECEIVE_ONLY },
  { symbol: 'ARB',   name: 'Arbitrum',  family: 'evm',    chain: 'arbitrumSepolia', status: ASSET_STATUS.RECEIVE_ONLY },
  { symbol: 'OP',    name: 'Optimism',  family: 'evm',    chain: 'optimismSepolia', status: ASSET_STATUS.RECEIVE_ONLY },
  { symbol: 'AVAX',  name: 'Avalanche', family: 'evm',    chain: 'avalancheFuji',   status: ASSET_STATUS.RECEIVE_ONLY },
  { symbol: 'BNB',   name: 'BNB Chain', family: 'evm',    chain: 'bnbTestnet',      status: ASSET_STATUS.RECEIVE_ONLY },
  // Phase BTC: real BIP-84 (native SegWit) derivation on Bitcoin TESTNET, behind
  // the mainnet gate (btc/networks.js). Address derivation + live balance reads
  // are wired now (receive_only). The SEND path (construct/sign/broadcast) is
  // built and tested, but stays HARD-gated at receive_only until a real testnet
  // send is verified on-chain and reviewed — only then does it flip to LIVE.
  // `chain` points at the verified testnet network key in btc/networks.js.
  { symbol: 'BTC',   name: 'Bitcoin',   family: 'btc',    chain: 'testnet',   status: ASSET_STATUS.RECEIVE_ONLY },
  // Phase SOL: real ed25519 / SLIP-0010 derivation on Solana DEVNET, behind the
  // mainnet gate (sol/networks.js). Address derivation + live balance reads are
  // wired now (receive_only). The SEND path (build/sign/broadcast, with explicit
  // blockhash-expiry and rent-exempt handling) is built and tested, but stays
  // HARD-gated at receive_only until a real devnet send is verified on-chain and
  // reviewed — only then does it flip to LIVE. `chain` points at the verified
  // devnet network key in sol/networks.js.
  { symbol: 'SOL',   name: 'Solana',    family: 'solana', chain: 'devnet',    status: ASSET_STATUS.RECEIVE_ONLY },
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
