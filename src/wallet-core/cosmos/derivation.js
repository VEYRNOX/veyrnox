// @ts-nocheck
// wallet-core/cosmos/derivation.js
//
// Cosmos SDK address derivation: secp256k1 HD key → bech32 address.
//
// ALGORITHM (Cosmos SDK standard, replaces the throwing stub in ../derivation.js)
//   1. BIP-44 path  m/44'/118'/0'/0/{index}  (coin type 118 = Cosmos Hub).
//   2. Compressed public key (33 bytes) from the secp256k1 child key.
//   3. SHA-256 → RIPEMD-160 of the compressed public key → 20-byte address hash.
//   4. bech32 encode with a chain-specific HRP ('cosmos', 'osmo', 'juno', …).
//
// SECURITY / CORRECTNESS RATIONALE
//   - Replaces the throwing `deriveCosmosAccount` stub. A placeholder or wrong
//     address silently burns funds; correctness is safety, and this is pinned
//     against the Cosmos SDK / Keplr published "abandon" mnemonic test vector
//     (see __tests__/cosmos-derivation.test.js).
//   - Uses only audited libraries already in the project:
//       @scure/bip32  — HD key derivation (same as BTC/SOL stacks)
//       @noble/hashes — SHA-256 + RIPEMD-160
//       @scure/base   — bech32 encoding (transitive dep of @scure/bip32)
//     No new dependency is required.
//   - privateKey is a LIVE SECRET. Callers must use it transiently for signing
//     and must never persist or log it.

import { HDKey } from '@scure/bip32';
import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { mnemonicToSeed } from '../mnemonic.js';

// BIP-44 coin type 118 (Cosmos Hub — ATOM). Other Cosmos chains share this
// derivation path; only the bech32 HRP differs.
const COSMOS_COIN_TYPE = 118;

/**
 * Build the Cosmos BIP-44 derivation path.
 * @param {number} index - address index (0-based).
 *
 * PATH NOTE (M-10, 2026-07-12): The final `index` level is NON-HARDENED, which
 * is correct per BIP-44 and matches Keplr/Cosmostation. This means that if an
 * attacker obtains BOTH a child private key at this level AND the account-level
 * extended public key (xpub at `m/44'/118'/0'`), they can derive all sibling
 * address private keys. Veyrnox does not export the account xpub (there is no
 * watch-wallet feature), so this risk is theoretical today. If a watch-wallet or
 * any xpub-export feature is ever added, this derivation structure means ALL
 * sibling private keys become computable from the xpub + any one child key.
 */
export function cosmosPath(index = 0) {
  return `m/44'/${COSMOS_COIN_TYPE}'/0'/0/${index}`;
}

/**
 * Derive a Cosmos-family account (address + key material) from a BIP-39
 * mnemonic. Works for any Cosmos SDK chain — pass the chain's bech32 HRP.
 *
 * @param {string} mnemonic
 * @param {object} [opts]
 * @param {string} [opts.hrp='cosmos']  - bech32 human-readable part.
 *   'cosmos' = Cosmos Hub, 'osmo' = Osmosis, 'juno' = Juno, etc.
 * @param {number} [opts.index=0]       - address index.
 * @param {string} [opts.passphrase=''] - optional BIP-39 passphrase.
 * @returns {{ address: string, publicKey: Uint8Array, privateKey: Uint8Array, path: string, hrp: string }}
 *          `address` is a bech32-encoded Cosmos SDK address.
 *          `privateKey` is a LIVE SECRET — do not persist or log.
 */
export function deriveCosmosAccount(mnemonic, opts = {}) {
  const { hrp = 'cosmos', index = 0, passphrase = '' } = opts;

  const seed = mnemonicToSeed(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed);
  const path = cosmosPath(index);
  const child = root.derive(path);
  if (!child.privateKey) throw new Error(`No private key at path ${path}`);

  // Cosmos SDK address: SHA-256 then RIPEMD-160 of the compressed public key.
  const pubkeyHash = ripemd160(sha256(child.publicKey));
  const words = bech32.toWords(pubkeyHash);
  const address = bech32.encode(hrp, words);

  return {
    address,
    publicKey: child.publicKey,
    privateKey: child.privateKey,
    path,
    hrp,
  };
}

/**
 * Public address only — no secret material. Convenient for display/receive.
 *
 * Architectural scope (I4 honesty), same as `deriveEvmAddress` (L-1, PR #1080,
 * carried to Cosmos as #1109): BIP-32 hardened derivation up to the account
 * level (m/44'/118'/0') unavoidably materialises the account-level private
 * key; it is zeroed immediately after the xpub is extracted. The LEAF signing
 * key at m/44'/118'/0'/0/index is NEVER materialised as a JS value — the
 * non-hardened `m/0/index` tail is derived in public-only mode via the
 * account-level extended public key.
 *
 * Callers that need the private key for signing must still use
 * `deriveCosmosAccount`; this function is safe for receive-address display,
 * portfolio fetch, and address comparison.
 *
 * @param {string} mnemonic
 * @param {object} [opts] - same as deriveCosmosAccount
 * @returns {{ address: string, path: string, hrp: string }}
 */
export function deriveCosmosAddress(mnemonic, opts = {}) {
  const { hrp = 'cosmos', index = 0, passphrase = '' } = opts;

  const seed = mnemonicToSeed(mnemonic, passphrase);
  // Derive private only as far as the hardened account level (m/44'/118'/0').
  // Then switch to a public-only node so the leaf private key at
  // m/44'/118'/0'/0/index never materialises as a JS value (#1109, L-1).
  const acctPriv = HDKey.fromMasterSeed(seed).derive(`m/44'/${COSMOS_COIN_TYPE}'/0'`);
  const acctPub = HDKey.fromExtendedKey(acctPriv.publicExtendedKey);
  if (acctPriv.privateKey) acctPriv.privateKey.fill(0); // best-effort wipe
  const node = acctPub.derive(`m/0/${index}`); // public-only path
  const publicKey = node.publicKey;
  if (!publicKey) throw new Error('Cosmos public key derivation failed');

  const pubkeyHash = ripemd160(sha256(publicKey));
  const words = bech32.toWords(pubkeyHash);
  const address = bech32.encode(hrp, words);
  const path = cosmosPath(index);
  return { address, path, hrp };
}
