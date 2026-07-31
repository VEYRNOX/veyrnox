// wallet-core/sol/derivation.js
//
// Solana account derivation from the SAME BIP-39 seed the EVM/BTC wallets use.
// The seed is the ONLY thing shared with the other stacks — everything below it
// is a distinct cryptographic family (ed25519, not secp256k1).
//
// SECURITY / CORRECTNESS RATIONALE
//   - Curve: ed25519 (Edwards), via @noble/curves — NOT the secp256k1 path used
//     by EVM/BTC. Different key generation, different signing primitive.
//   - Derivation: SLIP-0010 ed25519, hardened-only, path m/44'/501'/0'/0'. This
//     is the Phantom / Solflare convention, so a seed imported here yields the
//     SAME address mainstream Solana wallets show => funds are recoverable
//     elsewhere. The derivation math is pinned against the AUTHORITATIVE
//     SLIP-0010 ed25519 test vectors, and the derived address against an
//     independent reference (@solana/web3.js Keypair.fromSeed) — see
//     __tests__/sol-derivation.test.js. Correctness here IS safety: a wrong
//     curve, path, or all-hardened mistake silently produces a different,
//     unrecoverable wallet.
//   - Address: base58 of the 32-byte ed25519 PUBLIC key (no checksum casing like
//     EVM, no bech32 like BTC). Encoded with @scure/base (audited), not a
//     hand-rolled base58.
//   - INTEROP / PATH CAVEAT: Solana derivation paths have historically varied
//     (m/44'/501'/0'/0' vs m/44'/501'/0'). We standardise on the 4-level
//     Phantom-compatible path. A seed used with a different path derives a
//     DIFFERENT address. The interop match against a reference wallet is a
//     hands-on verification gate (see docs/PhaseSOL.md).
//
// KEY MATERIAL: the privateKey bytes returned here are a LIVE SECRET (the
// ed25519 seed scalar). Callers must use them transiently for signing and never
// persist or log them — same rule as the EVM/BTC private keys.

import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { mnemonicToSeed } from '../mnemonic.js';
import { deriveEd25519 } from './slip10.js';

// BIP-44 coin type for Solana is 501 (registered SLIP-0044). The account and
// change levels are ALSO hardened on Solana (unlike BIP-44 secp256k1, where
// change/index are non-hardened) — ed25519 supports hardened derivation only.
export const SOL_COIN_TYPE = 501;

/**
 * Build the Phantom/Solflare-compatible Solana derivation path.
 * @param {number} account - account index (hardened).
 * @returns {string} e.g. "m/44'/501'/0'/0'"
 */
export function solPath(account = 0) {
  return `m/44'/${SOL_COIN_TYPE}'/${account}'/0'`;
}

/**
 * Derive a Solana account (ed25519) from the shared mnemonic.
 *
 * @param {string} mnemonic            - BIP-39 mnemonic (shared seed).
 * @param {object} opts
 * @param {number} [opts.account=0]    - account index in the path.
 * @param {string} [opts.passphrase=''] - optional BIP-39 passphrase.
 * @returns {{ address: string, publicKey: Uint8Array, privateKey: Uint8Array, path: string }}
 *          `address` is the base58 ed25519 pubkey. `publicKey` is the 32-byte
 *          raw ed25519 key. `privateKey` is the 32-byte ed25519 seed scalar — a
 *          LIVE SECRET; do not persist/log.
 */
export function deriveSolAccount(mnemonic, opts = {}) {
  const { account = 0, passphrase = '' } = opts;

  const path = solPath(account);
  const seed = mnemonicToSeed(mnemonic, passphrase); // 64-byte seed (validates checksum)
  /** @type {{ key: Uint8Array, chainCode: Uint8Array } | null} */
  let node = null;
  try {
    node = deriveEd25519(seed, path);
    const privateKey = node.key;
    // ed25519 public key (32 bytes). @solana/web3.js's Keypair.fromSeed(privateKey)
    // produces this same key — asserted in tests — so the two key paths agree.
    const publicKey = ed25519.getPublicKey(privateKey);
    const address = base58.encode(publicKey);
    return { address, publicKey, privateKey, path };
  } finally {
    // Wipe intermediates that we did NOT return (M-2). The seed can regenerate
    // every wallet on every chain; the chainCode plus a leaked parent key can
    // derive siblings. The returned privateKey/publicKey are the caller's to
    // wipe after signing — see hw-send.
    seed.fill(0);
    if (node && node.chainCode) node.chainCode.fill(0);
  }
}

/**
 * Derive the Solana public key + address for RECEIVE / display, without ever
 * retaining the ed25519 scalar. This is the correct entry point for anything
 * that only needs the address (portfolio, receive screen, stealth).
 *
 * The scalar is materialised internally (SLIP-0010 leaves us no choice — the
 * public key comes from it), then wiped before return. Compared to calling
 * deriveSolAccount and throwing away .privateKey, this guarantees the secret
 * is gone at function exit rather than hoping the discarded reference is GC'd
 * (M-2, 2026-07-28 internal audit).
 * @returns {{ address: string, publicKey: Uint8Array, path: string }}
 */
export function deriveSolPublicKey(mnemonic, opts = {}) {
  const { account = 0, passphrase = '' } = opts;

  const path = solPath(account);
  const seed = mnemonicToSeed(mnemonic, passphrase);
  /** @type {{ key: Uint8Array, chainCode: Uint8Array } | null} */
  let node = null;
  try {
    node = deriveEd25519(seed, path);
    const publicKey = ed25519.getPublicKey(node.key);
    const address = base58.encode(publicKey);
    return { address, publicKey, path };
  } finally {
    seed.fill(0);
    if (node) {
      if (node.key) node.key.fill(0);
      if (node.chainCode) node.chainCode.fill(0);
    }
  }
}

/**
 * Public address only (no secret material) — for display / receive.
 */
export function deriveSolAddress(mnemonic, opts = {}) {
  const { address, path } = deriveSolPublicKey(mnemonic, opts);
  return { address, path };
}

/**
 * Validate a string is a well-formed Solana address: base58 that decodes to a
 * 32-byte ed25519 public key. Used to guard the send recipient (a malformed or
 * truncated address would burn funds).
 * @returns {boolean}
 */
export function isValidSolAddress(address) {
  if (typeof address !== 'string' || address.length < 32 || address.length > 44) return false;
  try {
    return base58.decode(address).length === 32;
  } catch {
    return false;
  }
}
