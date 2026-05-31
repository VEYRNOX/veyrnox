// wallet-core/index.js — public surface of the secure wallet core.
export { generateMnemonic, validateMnemonic, mnemonicToSeed } from './mnemonic.js';
export {
  COIN_TYPES,
  deriveEvmAccount,
  deriveSecp256k1AtPath,
  deriveBitcoinAccount,
  deriveSolanaAccount,
  deriveCosmosAccount,
  deriveTronAccount,
} from './derivation.js';
export { encryptVault, decryptVault } from './vault.js';
export { makeSigner, signMessage, sendNativeTransfer } from './signing.js';

// --- Bitcoin (Phase BTC) — separate BIP-84 / UTXO / PSBT stack, testnet-first,
// mainnet gated. Shares only the BIP-39 seed with the EVM family. See btc/. ---
export { deriveBtcAccount, deriveBtcAddress, btcPath, CHAIN_EXTERNAL, CHAIN_CHANGE } from './btc/derivation.js';
export { getBtcNetwork, getBtcNetworkInfo, listEnabledBtcNetworks, ALLOW_BTC_MAINNET } from './btc/networks.js';
export { getUtxos, getBalanceSats, getFeeRate, broadcastTx, setEsploraUrl } from './btc/provider.js';
export { selectCoins, estimateFeeSats, estimateVsize, assertPlanConserves } from './btc/coinselect.js';
export { estimateBtcSend, signAndBroadcastBtc } from './btc/send.js';
