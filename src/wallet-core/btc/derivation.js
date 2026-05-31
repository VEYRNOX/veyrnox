// wallet-core/btc/derivation.js
//
// BIP-84 (native SegWit / bech32, P2WPKH) address derivation for Bitcoin,
// derived from the SAME BIP-39 seed the EVM wallet uses. This is the only thing
// BTC shares with the EVM stack — everything past the seed is separate.
//
// SECURITY / CORRECTNESS RATIONALE
//   - Replaces the throwing `deriveBitcoinAccount` stub in ../derivation.js.
//     A placeholder address would silently burn funds; correctness here IS
//     safety, and it is pinned against PUBLISHED BIP-84 test vectors (see
//     __tests__/btc-derivation.test.js — the authoritative mainnet vectors
//     from the BIP-84 spec itself, plus the testnet address this code derives).
//   - Path: m/84'/{coinType}'/0'/{change}/{index}. coinType is 1' for testnet
//     AND signet, 0' for mainnet (BIP-84 standard — an off-by-one in the coin
//     type silently produces a different, unrecoverable wallet).
//   - HD derivation uses @scure/bip32 (already audited + in the project), the
//     same library family as the EVM seed handling. Address encoding uses
//     @scure/btc-signer's p2wpkh — no hand-rolled bech32.
//   - INTEROP CAVEAT (surface in UI): a seed imported from a BIP-44 (`1…`) or
//     BIP-49 (`3…`) wallet derives DIFFERENT addresses. We standardise on
//     BIP-84 (`bc1`/`tb1`). Same mnemonic, different address family.
//
// KEY MATERIAL: privateKey bytes returned here are a LIVE SECRET. Callers must
// use them transiently for signing and never persist or log them — same rule as
// the EVM private keys (see WalletProvider.withPrivateKey).

import { HDKey } from '@scure/bip32';
import { p2wpkh } from '@scure/btc-signer';
import { mnemonicToSeed } from '../mnemonic.js';
import { getBtcNetworkInfo } from './networks.js';

// BIP-84 purpose. The `'` (hardened) markers matter: a non-hardened purpose/
// coin/account would derive a different tree.
const BIP84_PURPOSE = 84;

// BIP-44 change constants: 0 = external (receive) chain, 1 = internal (change)
// chain. We expose both so a future multi-address upgrade can use a dedicated
// change branch; v1 sends change back to the wallet's own receive address (see
// coinselect.js header for the documented rationale).
export const CHAIN_EXTERNAL = 0;
export const CHAIN_CHANGE = 1;

/**
 * Build the BIP-84 derivation path for a network.
 * @param {number} coinType - 1 for testnet/signet, 0 for mainnet.
 * @param {0|1} change - external (0) or change (1) chain.
 * @param {number} index - address index on that chain.
 */
export function btcPath(coinType, change = CHAIN_EXTERNAL, index = 0) {
  return `m/${BIP84_PURPOSE}'/${coinType}'/0'/${change}/${index}`;
}

/**
 * Derive a BIP-84 P2WPKH account from the shared mnemonic for a given network.
 *
 * @param {string} mnemonic               - BIP-39 mnemonic (shared seed).
 * @param {object} opts
 * @param {string} [opts.networkKey='testnet'] - 'testnet' | 'signet' | 'mainnet'.
 * @param {0|1}    [opts.change=0]         - external/receive (0) or change (1) chain.
 * @param {number} [opts.index=0]          - address index.
 * @param {string} [opts.passphrase='']    - optional BIP-39 passphrase.
 * @returns {{ address: string, publicKey: Uint8Array, privateKey: Uint8Array, path: string }}
 *          `address` is a bech32 P2WPKH (tb1…/bc1…). `privateKey` is a LIVE
 *          SECRET — do not persist/log.
 */
export function deriveBtcAccount(mnemonic, opts = {}) {
  const {
    networkKey = 'testnet',
    change = CHAIN_EXTERNAL,
    index = 0,
    passphrase = '',
  } = opts;

  const net = getBtcNetworkInfo(networkKey);
  if (!net) throw new Error(`Unknown Bitcoin network: ${networkKey}`);

  const seed = mnemonicToSeed(mnemonic, passphrase); // 64-byte seed (validates checksum)
  const root = HDKey.fromMasterSeed(seed);
  const path = btcPath(net.coinType, change, index);
  const child = root.derive(path);
  if (!child.privateKey) throw new Error(`No private key at path ${path}`);

  // p2wpkh encodes the compressed pubkey hash as a bech32 address for THIS
  // network's params (HRP tb/bc). publicKey from @scure/bip32 is the 33-byte
  // compressed key BIP-84 mandates.
  const { address } = p2wpkh(child.publicKey, net.params);
  if (!address) throw new Error('Failed to derive P2WPKH address');

  return {
    address,
    publicKey: child.publicKey,
    privateKey: child.privateKey,
    path,
  };
}

/**
 * Public address only (no secret material) — convenient for display/receive and
 * for deriving the change address inside the send path without exposing keys.
 */
export function deriveBtcAddress(mnemonic, opts = {}) {
  const { address, path } = deriveBtcAccount(mnemonic, opts);
  return { address, path };
}
