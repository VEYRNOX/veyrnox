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
  // USDC: VERIFIED LIVE. Real ERC-20 transfer constructed, signed, and broadcast
  // through the full in-app UI send path (asset picker → recipient → amount →
  // Standard fee → step-up PIN re-auth → broadcast) and confirmed on-chain:
  //   tx 0x687d8ce3b2cf4dba3cf007b2dc13510af6102d1c02dff2ab9dd5fbfe2bf6e298
  //   (Sepolia, status SUCCESS, block 11074999, transfer 1 USDC
  //    from 0x90f9f1F9…E68a729 → 0xd8dA6BF2…aA96045, gasUsed 45059, decimals 6)
  //   https://sepolia.etherscan.io/tx/0x687d8ce3b2cf4dba3cf007b2dc13510af6102d1c02dff2ab9dd5fbfe2bf6e298
  // Contract = Circle's official Sepolia USDC (evm/tokens.js). Mainnet stays gated.
  { symbol: 'USDC',  name: 'USD Coin',  family: 'erc20',  chain: 'sepolia',   status: ASSET_STATUS.LIVE },
  // USDT: VERIFIED LIVE. Routes through the SAME ERC-20 path as USDC. Tether ships
  // no official Sepolia deployment, so we use the authoritative Aave faucet
  // test-USDT as a verified 6-decimal stand-in (evm/tokens.js). Real UI-path
  // transfer confirmed on-chain:
  //   tx 0x3168e46f467483ee20c176575d4ac11ff4528c90c951fc68de657b86866c447d
  //   (Sepolia, status SUCCESS, block 11075008, transfer 1 USDT
  //    from 0x90f9f1F9…E68a729 → 0xd8dA6BF2…aA96045, gasUsed 34546, decimals 6)
  //   https://sepolia.etherscan.io/tx/0x3168e46f467483ee20c176575d4ac11ff4528c90c951fc68de657b86866c447d
  // Mainnet stays gated — same discipline as USDC.
  { symbol: 'USDT',  name: 'Tether',    family: 'erc20',  chain: 'sepolia',   status: ASSET_STATUS.LIVE },
  // Phase C: five EVM chains added on their TESTNETS, behind the mainnet gate.
  // Each shares the SAME secp256k1 / m/44'/60'/0'/0/0 address as ETH, so the
  // address derivation + live per-chain balance reads are wired now (receive_only).
  // `chain` points at the verified TESTNET network key (mainnets stay gated in
  // networks.js). SEND stays HARD-gated until a real testnet transfer on THAT
  // chain is verified on-chain and reviewed — only then does it flip to LIVE.
  // NOTE: gas/native token differs per chain (Polygon=POL, Avalanche=AVAX,
  // BNB=tBNB, but Arbitrum/Optimism=ETH); the UI reads that from networks.js.
  { symbol: 'MATIC', name: 'Polygon',   family: 'evm',    chain: 'polygonAmoy',     status: ASSET_STATUS.RECEIVE_ONLY },
  // ARB: VERIFIED LIVE. A real testnet transfer was constructed, signed, and
  // broadcast through the full in-app UI send path (asset picker → recipient →
  // amount → fee → Confirm & Send → step-up re-auth) and confirmed on-chain:
  //   tx 0x797928efdccfe85e858c4050c979b6b69b324c42b11eb642b8c5607109bdca39
  //   (Arbitrum Sepolia, status SUCCESS, from m/44'/60'/0'/0/0, gasUsed 23534)
  //   https://sepolia.arbiscan.io/tx/0x797928efdccfe85e858c4050c979b6b69b324c42b11eb642b8c5607109bdca39
  // Mainnet stays gated in networks.js (this is the Arbitrum SEPOLIA testnet).
  { symbol: 'ARB',   name: 'Arbitrum',  family: 'evm',    chain: 'arbitrumSepolia', status: ASSET_STATUS.LIVE },
  // OP: VERIFIED LIVE. Real testnet transfer through the full in-app UI send path,
  // confirmed on-chain:
  //   tx 0xc3fd1e145a6d37c18a211a1ff673251b42dd72a9d4d56c24c48483c25d3c1a47
  //   (OP Sepolia, status SUCCESS, from m/44'/60'/0'/0/0, gasUsed 21000)
  //   https://sepolia-optimism.etherscan.io/tx/0xc3fd1e145a6d37c18a211a1ff673251b42dd72a9d4d56c24c48483c25d3c1a47
  // Funded by bridging Sepolia ETH via the OptimismPortal. Mainnet stays gated.
  { symbol: 'OP',    name: 'Optimism',  family: 'evm',    chain: 'optimismSepolia', status: ASSET_STATUS.LIVE },
  { symbol: 'AVAX',  name: 'Avalanche', family: 'evm',    chain: 'avalancheFuji',   status: ASSET_STATUS.RECEIVE_ONLY },
  { symbol: 'BNB',   name: 'BNB Chain', family: 'evm',    chain: 'bnbTestnet',      status: ASSET_STATUS.RECEIVE_ONLY },
  // Phase BTC: real BIP-84 (native SegWit) derivation on Bitcoin TESTNET, behind
  // the mainnet gate (btc/networks.js). Address derivation + live balance reads
  // are wired now (receive_only). The SEND path (construct/sign/broadcast) is
  // built and tested, but stays HARD-gated at receive_only until a real testnet
  // send is verified on-chain and reviewed — only then does it flip to LIVE.
  // `chain` points at the verified testnet network key in btc/networks.js.
  // BTC: VERIFIED LIVE. Real testnet transfer through the full in-app UI send path
  // (BIP-84 P2WPKH, signAndBroadcastBtc), confirmed on-chain:
  //   tx 2da87a2755881de629c8a8a78627524b39f1235774ea215fbd58adfb0c09df27
  //   (Bitcoin testnet, block 4990901, spends from tb1qztdfvzkd…, 0.0001 BTC + change)
  //   https://mempool.space/testnet/tx/2da87a2755881de629c8a8a78627524b39f1235774ea215fbd58adfb0c09df27
  // Mainnet stays gated in btc/networks.js.
  { symbol: 'BTC',   name: 'Bitcoin',   family: 'btc',    chain: 'testnet',   status: ASSET_STATUS.LIVE },
  // Phase SOL: real ed25519 / SLIP-0010 derivation on Solana DEVNET, behind the
  // mainnet gate (sol/networks.js). Address derivation + live balance reads are
  // wired now (receive_only). The SEND path (build/sign/broadcast, with explicit
  // blockhash-expiry and rent-exempt handling) is built and tested, but stays
  // HARD-gated at receive_only until a real devnet send is verified on-chain and
  // reviewed — only then does it flip to LIVE. `chain` points at the verified
  // devnet network key in sol/networks.js.
  // SOL: VERIFIED LIVE. Real devnet transfer through the full in-app UI send path
  // (ed25519/SLIP-0010, signAndBroadcastSol), confirmed on-chain:
  //   sig 5KGXAGTJTdYj2bQdemNY6CAtFQuBcVra8nsnNSSpnL4YESAfeiMCAzDHAuX7i6s47WonPwhMMkUXocRTcKTWEBVv
  //   (Solana devnet, FINALIZED, fee payer Cp5MYrCM…, 0.01 SOL, err: null)
  //   https://explorer.solana.com/tx/5KGXAGTJTdYj2bQdemNY6CAtFQuBcVra8nsnNSSpnL4YESAfeiMCAzDHAuX7i6s47WonPwhMMkUXocRTcKTWEBVv?cluster=devnet
  // Mainnet stays gated in sol/networks.js.
  { symbol: 'SOL',   name: 'Solana',    family: 'solana', chain: 'devnet',    status: ASSET_STATUS.LIVE },
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
