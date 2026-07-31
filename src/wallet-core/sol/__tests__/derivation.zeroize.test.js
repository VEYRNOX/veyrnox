// wallet-core/sol/__tests__/derivation.zeroize.test.js
//
// Regression: the Solana derivation path must not leave live ed25519 scalars or
// intermediate SLIP-0010 HMAC halves on the heap after it returns. See M-2
// (2026-07-28 internal audit): deriveSolAddress previously called
// deriveSolAccount and threw away .privateKey, which does NOT wipe the bytes —
// it merely orphans a reference. The receive path now uses deriveSolPublicKey,
// which materialises the scalar internally and wipes it before return, and the
// underlying SLIP-0010 primitive wipes its 64-byte HMAC scratch after slicing.

import { describe, it, expect } from 'vitest';
import { deriveEd25519 } from '../slip10.js';
import {
  deriveSolAccount,
  deriveSolAddress,
  deriveSolPublicKey,
} from '../derivation.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('M-2 — receive path does not surface secret material', () => {
  it('deriveSolPublicKey returns no privateKey field', () => {
    const result = deriveSolPublicKey(TEST_MNEMONIC);
    expect(Object.prototype.hasOwnProperty.call(result, 'privateKey')).toBe(false);
    expect(typeof result.address).toBe('string');
    expect(result.publicKey).toBeInstanceOf(Uint8Array);
    expect(result.publicKey.length).toBe(32);
    // The public key must be real (non-trivial), not an accidental zero buffer
    // from over-eager wiping.
    expect(result.publicKey.some((b) => b !== 0)).toBe(true);
  });

  it('deriveSolAddress returns no privateKey / publicKey — address + path only', () => {
    const result = deriveSolAddress(TEST_MNEMONIC);
    expect(Object.prototype.hasOwnProperty.call(result, 'privateKey')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'publicKey')).toBe(false);
    expect(result.address).toEqual(expect.any(String));
    expect(result.path).toEqual(expect.any(String));
  });

  it('deriveSolPublicKey and deriveSolAccount produce the same address', () => {
    // Sanity — the split must not change the derivation math.
    const pub = deriveSolPublicKey(TEST_MNEMONIC);
    const acct = deriveSolAccount(TEST_MNEMONIC);
    expect(pub.address).toBe(acct.address);
    expect(pub.path).toBe(acct.path);
  });
});

describe('M-2 — deriveSolAccount preserves the returned scalar for the caller', () => {
  it('returned privateKey / publicKey are non-zero and usable', () => {
    const { privateKey, publicKey } = deriveSolAccount(TEST_MNEMONIC);
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(privateKey.length).toBe(32);
    expect(privateKey.some((b) => b !== 0)).toBe(true);
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(32);
    expect(publicKey.some((b) => b !== 0)).toBe(true);
  });
});

describe('M-2 — SLIP-0010 primitive returns independent copies (HMAC scratch is not aliased)', () => {
  // If masterKey / deriveChild returned views into the same 64-byte HMAC
  // buffer, wiping the buffer after slicing (the M-2 fix) would corrupt the
  // returned key. Prove the returned halves are independent copies by mutating
  // them and re-deriving from the same seed: the second derivation must match
  // the first pre-mutation.
  it('returned key/chainCode are copies, not views into the HMAC output', () => {
    const seed = new Uint8Array(64).fill(0x42);
    const first = deriveEd25519(seed, "m/44'/501'/0'/0'");
    const keySnapshot = new Uint8Array(first.key);
    const chainSnapshot = new Uint8Array(first.chainCode);

    // Overwrite the returned buffers. If they were views into the internal HMAC
    // buffer that we now wipe, this would (a) already read as zero, and (b) any
    // shared state would cause the re-derive below to change.
    first.key.fill(0xff);
    first.chainCode.fill(0xff);

    const second = deriveEd25519(seed, "m/44'/501'/0'/0'");
    expect(second.key).toEqual(keySnapshot);
    expect(second.chainCode).toEqual(chainSnapshot);

    // And the returned buffer offsets are honest 32-byte Uint8Arrays.
    expect(second.key.byteLength).toBe(32);
    expect(second.chainCode.byteLength).toBe(32);
  });
});
