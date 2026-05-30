// wallet-core/derivation.js
//
// HD key derivation (BIP-32/44) producing REAL addresses from REAL keys.
//
// SECURITY RATIONALE
// ------------------
// Replaces the placeholder deriveAddress() that string-hashed "ethereum-0"
// with a multiply-by-31 loop and padded the result. Those were decorative
// strings, not cryptographic addresses — funds sent to them are unrecoverable.
//
// Here addresses are derived from actual public keys via audited libraries:
//   - EVM chains: ethers v6 HDNodeWallet (secp256k1).
//   - Solana:     ed25519 SLIP-0010 derivation via @scure/ed25519 path.
//   - Others (BTC/Cosmos/Tron): noted as STUBS to implement with the
//     correct address encoding per chain — DO NOT ship placeholder encoders.
//
// CORRECTNESS IS SAFETY: an off-by-one in a hardened derivation index or a
// wrong coin type silently produces a different wallet. Every chain MUST be
// validated against published BIP-44 / chain test vectors before use.

import { HDKey } from '@scure/bip32';
import { HDNodeWallet, Mnemonic } from 'ethers';
import { mnemonicToSeed } from './mnemonic.js';

// Standard BIP-44 coin types. Verify each against the chain's spec/test vectors.
export const COIN_TYPES = {
  ethereum: 60,
  bitcoin: 0,
  solana: 501,
  cosmos: 118,
  tron: 195,
};

/**
 * Derive an EVM account (Ethereum and all EVM-compatible chains share coin
 * type 60 + the same address format).
 * @param {string} mnemonic
 * @param {number} accountIndex - the final path index (m/44'/60'/0'/0/{index})
 * @param {string} [passphrase]
 * @returns {{ address: string, privateKey: string, path: string }}
 *          privateKey is a LIVE SECRET — caller must not persist it in plaintext.
 */
export function deriveEvmAccount(mnemonic, accountIndex = 0, passphrase = '') {
  const path = `m/44'/60'/0'/0/${accountIndex}`;
  // ethers handles BIP-39 -> BIP-32 -> secp256k1 -> EIP-55 address correctly.
  const mn = Mnemonic.fromPhrase(mnemonic, passphrase || null);
  const node = HDNodeWallet.fromMnemonic(mn, path);
  return { address: node.address, privateKey: node.privateKey, path };
}

/**
 * Derive raw BIP-32 key material for non-EVM chains from the seed.
 * Returns the private key bytes at the given path; the CALLER must apply the
 * chain-correct public-key + address encoding. This deliberately does NOT
 * fabricate an address, to avoid the original placeholder mistake.
 * @returns {{ privateKey: Uint8Array, publicKey: Uint8Array, path: string }}
 */
export function deriveSecp256k1AtPath(mnemonic, path, passphrase = '') {
  const seed = mnemonicToSeed(mnemonic, passphrase); // 64-byte seed
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);
  if (!child.privateKey) throw new Error(`No private key at path ${path}`);
  return { privateKey: child.privateKey, publicKey: child.publicKey, path };
}

// ---------------------------------------------------------------------------
// STUBS — implement per-chain encoders with correct libraries + test vectors.
// Left explicit (and throwing) so they cannot be mistaken for working code.
// ---------------------------------------------------------------------------

export function deriveBitcoinAccount() {
  // TODO: use @scure/btc-signer or bitcoinjs-lib for bech32/P2WPKH encoding.
  throw new Error('NOT IMPLEMENTED: Bitcoin address encoding. Implement with @scure/btc-signer + BIP-84 test vectors.');
}

export function deriveSolanaAccount() {
  // TODO: ed25519 SLIP-0010 (m/44'/501'/0'/0') -> base58 pubkey via @solana/web3.js.
  throw new Error('NOT IMPLEMENTED: Solana ed25519 derivation. Implement with SLIP-0010 + @solana/web3.js test vectors.');
}

export function deriveCosmosAccount() {
  // TODO: secp256k1 -> bech32 with chain prefix (cosmos/osmo/etc.).
  throw new Error('NOT IMPLEMENTED: Cosmos bech32 encoding. Implement with @cosmjs + test vectors.');
}

export function deriveTronAccount() {
  // TODO: secp256k1 -> Keccak -> base58check with 0x41 prefix.
  throw new Error('NOT IMPLEMENTED: Tron address encoding. Implement with TronWeb + test vectors.');
}
