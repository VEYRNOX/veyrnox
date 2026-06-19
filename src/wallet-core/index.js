// wallet-core/index.js — public surface of the secure wallet core.
export { generateMnemonic, validateMnemonic, mnemonicToSeed } from './mnemonic.js';
// EVM EIP-1559 fee tiers / custom-fee plumbing (Phase: gas control). Fee numbers
// come from the existing provider; selection maps to exact tx overrides.
export { estimateEvmFeeTiers, buildEvmTiers, buildEvmCustomFee, evmFeeOverrides, EVM_TIERS } from './evm/fees.js';
export {
  COIN_TYPES,
  deriveEvmAccount,
  deriveSecp256k1AtPath,
  deriveBitcoinAccount,
  deriveSolanaAccount,
  deriveCosmosAccount,
} from './derivation.js';
export { encryptVault, decryptVault } from './vault.js';
// NOTE: the old top-level signing.js (makeSigner/sendNativeTransfer) was removed
// (internal audit EVM-#1). It built a raw JsonRpcProvider from an arbitrary rpcUrl
// with NO ALLOW_MAINNET gate — a gate-bypassing foot-gun. It was dead (no live
// caller); all real EVM sending goes through the gated evm/send.js + token-send.js.

// --- Bitcoin (Phase BTC) — separate BIP-84 / UTXO / PSBT stack, testnet-first,
// mainnet gated. Shares only the BIP-39 seed with the EVM family. See btc/. ---
export { deriveBtcAccount, deriveBtcAddress, btcPath, CHAIN_EXTERNAL, CHAIN_CHANGE } from './btc/derivation.js';
export { getBtcNetwork, getBtcNetworkInfo, listEnabledBtcNetworks, ALLOW_BTC_MAINNET } from './btc/networks.js';
export { getUtxos, getBalanceSats, getFeeRate, broadcastTx, setEsploraUrl } from './btc/provider.js';
export { selectCoins, estimateFeeSats, estimateVsize, assertPlanConserves } from './btc/coinselect.js';
export { estimateBtcSend, signAndBroadcastBtc } from './btc/send.js';
export { isValidBtcAddress, assertValidBtcAddress } from './btc/validate.js';
export { estimateBtcFeeTiers, buildBtcTiers, clampMonotonic, BTC_TIERS } from './btc/fees.js';

// --- Solana (Phase SOL) — separate ed25519 / SLIP-0010 / account stack,
// devnet-first, mainnet gated. Shares only the BIP-39 seed (different curve from
// EVM/BTC entirely). See sol/. ---
export { deriveSolAccount, deriveSolAddress, isValidSolAddress, solPath, SOL_COIN_TYPE } from './sol/derivation.js';
export { getSolNetwork, getSolNetworkInfo, listEnabledSolNetworks, solExplorerUrl, ALLOW_SOL_MAINNET } from './sol/networks.js';
export { getBalanceLamports, getBalanceSol, getLatestBlockhash, getRentExemptMinimum, getLamportsPerSignature, getRecentPrioritizationFee, broadcastRawTx, confirmTx, setSolRpcUrl, getConnection, LAMPORTS_PER_SOL } from './sol/provider.js';
export { planSolTransfer, estimateSolSend, signAndBroadcastSol, buildAndSignSol, solComputeBudgetIxns } from './sol/send.js';
export { estimateSolFeeTiers, buildSolTiers, solPriorityLamports, SOL_TIERS, SOL_DEFAULT_CU_LIMIT } from './sol/fees.js';
