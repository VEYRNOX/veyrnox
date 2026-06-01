// wallet-core/sol/slip10.js
//
// SLIP-0010 ed25519 hierarchical key derivation.
//
// WHY A SEPARATE PRIMITIVE
//   Solana keys are ed25519 (Edwards curve), NOT secp256k1. The EVM/BTC stacks
//   use BIP-32 secp256k1 derivation (@scure/bip32); that math DOES NOT apply to
//   ed25519. SLIP-0010 specifies the ed25519 variant, and it differs from BIP-32
//   in two consequential ways:
//     1. The master HMAC key is the ASCII string "ed25519 seed" (not "Bitcoin
//        seed").
//     2. ed25519 supports HARDENED derivation ONLY. There is no public/parent
//        key derivation; every index is implicitly hardened. A non-hardened
//        segment is a spec violation and would silently produce a wrong wallet.
//
// IMPLEMENTATION NOTES
//   - Built on @noble/hashes (hmac + sha512) — the same audited primitive family
//     already in the project. No hand-rolled hashing, no new heavy dependency.
//   - Verified against the AUTHORITATIVE SLIP-0010 ed25519 test vectors (seed
//     000102…0f) in __tests__/sol-derivation.test.js. Passing those vectors
//     proves the derivation math is byte-for-byte the published standard, which
//     is what makes a Solana seed recoverable in Phantom/Solflare.
//   - This module returns the 32-byte ed25519 PRIVATE scalar (the "seed" half).
//     The caller turns it into a public key / signer. The returned bytes are a
//     LIVE SECRET — use transiently, never persist or log.

import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';

// SLIP-0010 hardened offset. For ed25519 EVERY index is hardened, so we OR this
// into each path segment. An un-hardened ed25519 derivation is undefined by the
// spec; we never expose a way to request one.
const HARDENED_OFFSET = 0x80000000;

// The fixed master HMAC key for the ed25519 curve (SLIP-0010 §"Master key
// generation"). A wrong curve string here produces an entirely different tree.
const ED25519_CURVE = new TextEncoder().encode('ed25519 seed');

/**
 * SLIP-0010 master node from a BIP-39 seed.
 * @param {Uint8Array} seed - 64-byte BIP-39 seed.
 * @returns {{ key: Uint8Array, chainCode: Uint8Array }} 32-byte private scalar + chain code.
 */
function masterKey(seed) {
  const I = hmac(sha512, ED25519_CURVE, seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/**
 * SLIP-0010 ed25519 child key derivation (CKDpriv). Hardened only.
 * I = HMAC-SHA512(chainCode, 0x00 || key || ser32(index)).
 * @param {{key:Uint8Array, chainCode:Uint8Array}} parent
 * @param {number} index - the already-hardened index (>= 0x80000000).
 */
function deriveChild(parent, index) {
  // data = 0x00 || parent private key (32) || ser32(index) (4, big-endian)
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.key, 1);
  const i = index >>> 0;
  data[33] = (i >>> 24) & 0xff;
  data[34] = (i >>> 16) & 0xff;
  data[35] = (i >>> 8) & 0xff;
  data[36] = i & 0xff;
  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/**
 * Parse a path like "m/44'/501'/0'/0'" into numeric segments. EVERY segment must
 * be hardened (trailing `'` or `h`) — ed25519 has no non-hardened derivation, so
 * a bare segment is rejected rather than silently coerced (a wrong path = a
 * different, unrecoverable wallet).
 * @returns {number[]} the raw (pre-hardened) indices.
 */
export function parseSlip10Path(path) {
  if (typeof path !== 'string' || !/^m(\/[0-9]+['h])+$/.test(path.trim())) {
    throw new Error(`Invalid SLIP-0010 ed25519 path (all segments must be hardened): ${path}`);
  }
  return path
    .trim()
    .split('/')
    .slice(1) // drop leading "m"
    .map(seg => {
      const n = parseInt(seg.slice(0, -1), 10); // strip the ' / h marker
      if (!Number.isInteger(n) || n < 0 || n >= HARDENED_OFFSET) {
        throw new Error(`Path index out of range: ${seg}`);
      }
      return n;
    });
}

/**
 * Derive the ed25519 private scalar at a SLIP-0010 path from a BIP-39 seed.
 * @param {Uint8Array} seed - 64-byte BIP-39 seed (LIVE SECRET).
 * @param {string} path - e.g. "m/44'/501'/0'/0'". All segments hardened.
 * @returns {{ key: Uint8Array, chainCode: Uint8Array }} 32-byte private scalar (LIVE SECRET) + chain code.
 */
export function deriveEd25519(seed, path) {
  const segments = parseSlip10Path(path);
  let node = masterKey(seed);
  for (const index of segments) {
    node = deriveChild(node, (index >>> 0) + HARDENED_OFFSET);
  }
  return node;
}
