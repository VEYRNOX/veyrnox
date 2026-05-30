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
