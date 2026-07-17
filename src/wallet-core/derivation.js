// @ts-nocheck
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
import { HDNodeWallet, Mnemonic, computeAddress } from 'ethers';
import { bytesToHex } from '@noble/hashes/utils';
import { mnemonicToSeed } from './mnemonic.js';

// Standard BIP-44 coin types. Verify each against the chain's spec/test vectors.
export const COIN_TYPES = {
  ethereum: 60,
  bitcoin: 0,
  solana: 501,
  cosmos: 118,
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
 * Derive the EVM address for a given account index WITHOUT materialising the
 * LEAF private key as a JS value. Uses @scure/bip32 public-key derivation +
 * ethers.computeAddress. Safe for receive-address display, portfolio fetch,
 * and address comparison — callers that need the private key for signing
 * must still use deriveEvmAccount (L-1, S1-S4 audit).
 *
 * Architectural scope (I4 honesty): BIP-32 hardened derivation up to the
 * account level (m/44'/60'/0') unavoidably requires the parent private key;
 * it is zeroed immediately after the xpub is extracted. The EVM LEAF private
 * key at m/44'/60'/0'/0/index is never materialised — that is the audit goal.
 * @param {string} mnemonic
 * @param {number} [accountIndex=0]
 * @param {string} [passphrase='']
 * @returns {string} checksummed EIP-55 address
 */
export function deriveEvmAddress(mnemonic, accountIndex = 0, passphrase = '') {
  const seed = mnemonicToSeed(mnemonic, passphrase); // 64-byte BIP-39 seed
  // Derive private only as far as the hardened account level (m/44'/60'/0').
  // Then switch to a public-only node so the leaf private key at m/44'/60'/0'/0/index
  // never materialises as a JS value (Codex P1 — L-1 audit).
  const acctPriv = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'`);
  const acctPub = HDKey.fromExtendedKey(acctPriv.publicExtendedKey);
  if (acctPriv.privateKey) acctPriv.privateKey.fill(0); // best-effort wipe
  const node = acctPub.derive(`m/0/${accountIndex}`); // public-only path
  const pub = node.publicKey;
  if (!pub) throw new Error('EVM public key derivation failed');
  return computeAddress('0x' + bytesToHex(pub));
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

// Bitcoin is now IMPLEMENTED in the parallel btc/ stack (BIP-84 native SegWit,
// @scure/btc-signer), kept separate because it shares nothing with the EVM
// secp256k1/account engine beyond the seed. This thin re-export keeps the public
// derivation surface in one place; the real logic + test vectors live in
// btc/derivation.js. Defaults to testnet (mainnet is gated in btc/networks.js).
export { deriveBtcAccount as deriveBitcoinAccount } from './btc/derivation.js';

// Solana is now IMPLEMENTED in the parallel sol/ stack (ed25519 SLIP-0010,
// m/44'/501'/0'/0', base58 address), kept separate because it shares NOTHING
// with the EVM/BTC secp256k1 engine beyond the seed (different curve entirely).
// This thin re-export keeps the public derivation surface in one place; the real
// logic + test vectors live in sol/derivation.js. Devnet-first (mainnet gated in
// sol/networks.js).
export { deriveSolAccount as deriveSolanaAccount } from './sol/derivation.js';

// Cosmos is now IMPLEMENTED in the parallel cosmos/ stack (BIP-44 coin type 118,
// secp256k1 compressed pubkey → SHA-256 → RIPEMD-160 → bech32). Supports any
// Cosmos SDK chain via the `hrp` option ('cosmos', 'osmo', 'juno', …). Uses only
// libraries already in the project (@scure/bip32, @noble/hashes, @scure/base).
// Pinned against the Cosmos SDK / Keplr published test vectors.
export { deriveCosmosAccount, deriveCosmosAddress } from './cosmos/derivation.js';

// Tron: removed. If needed, implement secp256k1 → Keccak256 → base58check(0x41)
// with TronWeb or tronweb-utils, and pin against published test vectors before use.
