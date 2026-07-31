// L-1: deriveRaw must zero the encoded PIN/password bytes in a finally block, so
// the credential does not linger on the heap after the KDF completes or if the
// KDF throws (Defect-A OOM). Mirrors the vault.js deriveKey() zero(pw) pattern.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured = { buf: null, throwOnce: false };

vi.mock('hash-wasm', () => ({
  argon2id: vi.fn(async ({ password, hashLength }) => {
    // Keep a live reference to the password buffer the caller passed in so the
    // test can assert deriveRaw zeroed it after the KDF returned.
    captured.buf = password;
    if (captured.throwOnce) {
      captured.throwOnce = false;
      throw new Error('simulated Argon2id OOM');
    }
    return new Uint8Array(hashLength);
  }),
}));

// Import AFTER the mock is declared.
const { createCredentialVerifier, captureVerifierSafe } = await import('../credentialVerifier.js');

const CHEAP = Object.freeze({ parallelism: 1, iterations: 1, memorySize: 1024, hashLength: 32 });

function isAllZero(u8) {
  for (let i = 0; i < u8.length; i++) if (u8[i] !== 0) return false;
  return true;
}

beforeEach(() => {
  captured.buf = null;
  captured.throwOnce = false;
});

describe('credentialVerifier deriveRaw — L-1 PIN byte zeroization', () => {
  it('zeros the encoded credential bytes after a successful derivation', async () => {
    await createCredentialVerifier('correct horse battery staple', { params: CHEAP });
    expect(captured.buf).toBeInstanceOf(Uint8Array);
    expect(captured.buf.length).toBeGreaterThan(0);
    expect(isAllZero(captured.buf)).toBe(true);
  });

  it('zeros the encoded credential bytes even when argon2id throws', async () => {
    captured.throwOnce = true;
    // captureVerifierSafe swallows the throw; deriveRaw's finally must still fire.
    const v = await captureVerifierSafe('sensitive-pin-1234', { params: CHEAP });
    expect(v).toBeNull();
    expect(captured.buf).toBeInstanceOf(Uint8Array);
    expect(captured.buf.length).toBeGreaterThan(0);
    expect(isAllZero(captured.buf)).toBe(true);
  });
});
