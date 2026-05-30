// wallet-core/mnemonic.js
//
// Secure BIP-39 mnemonic generation and validation.
//
// SECURITY RATIONALE
// ------------------
// This module exists to replace the placeholder generator that used
// Math.random() over a ~130-word list. That approach is catastrophic:
//   - Math.random() is NOT a CSPRNG and is predictable.
//   - A short word list collapses entropy to a brute-forceable space.
//   - The output was not a valid BIP-39 mnemonic (no checksum), so it
//     could never be recovered in any other wallet.
//
// Here we use @scure/bip39 (audited, dependency-light) with the full
// 2048-word English list, and entropy is sourced internally by the
// library from the platform CSPRNG (crypto.getRandomValues in browsers,
// node:crypto in Node). We never hand-roll entropy or words.
//
// THREAT MODEL NOTES
//   - 128-bit entropy (12 words) is the practical floor; 256-bit (24
//     words) is offered for higher-assurance users / cold storage.
//   - This module deals in PLAINTEXT secrets. Callers must treat the
//     returned mnemonic as live key material: never log it, never send
//     it to a backend, minimize its lifetime, and hand it to the vault
//     (see vault.js) for encryption as soon as possible.

import { generateMnemonic as scureGenerate, validateMnemonic as scureValidate, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

/**
 * Generate a cryptographically secure BIP-39 mnemonic.
 * @param {128|256} strength - entropy bits. 128 => 12 words, 256 => 24 words.
 * @returns {string} space-separated mnemonic (LIVE SECRET)
 */
export function generateMnemonic(strength = 128) {
  if (strength !== 128 && strength !== 256) {
    throw new Error('strength must be 128 (12 words) or 256 (24 words)');
  }
  // @scure/bip39 pulls entropy from the platform CSPRNG internally and
  // appends the BIP-39 checksum. Do not substitute your own RNG here.
  return scureGenerate(wordlist, strength);
}

/**
 * Validate a mnemonic's wordlist membership AND checksum.
 * Use this on import before deriving anything.
 * @param {string} mnemonic
 * @returns {boolean}
 */
export function validateMnemonic(mnemonic) {
  return scureValidate(normalize(mnemonic), wordlist);
}

/**
 * Convert a mnemonic (+ optional passphrase) to a BIP-39 seed.
 * The optional passphrase is the BIP-39 "25th word" — if used, it is
 * required for recovery and is NOT stored anywhere by this module.
 * @param {string} mnemonic
 * @param {string} [passphrase]
 * @returns {Uint8Array} 64-byte seed (LIVE SECRET)
 */
export function mnemonicToSeed(mnemonic, passphrase = '') {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic: failed BIP-39 checksum/wordlist check');
  }
  return mnemonicToSeedSync(normalize(mnemonic), passphrase);
}

// BIP-39 normalization: trim, collapse whitespace, lowercase, NFKD.
function normalize(mnemonic) {
  return mnemonic
    .normalize('NFKD')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
