import { describe, it, expect } from 'vitest';
import {
  createCredentialVerifier,
  verifyCredential,
  constantTimeEqual,
} from '../credentialVerifier.js';
import { KDF_PARAMS } from '../vault.js';

// Cheap Argon2id params for the behavioural tests (full KDF_PARAMS is 192 MiB and
// slow). The params==unlock guarantee is checked separately and cheaply below.
const CHEAP = Object.freeze({ parallelism: 1, iterations: 1, memorySize: 1024, hashLength: 32 });

describe('constantTimeEqual', () => {
  it('true for identical byte arrays', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
  });
  it('false when the FIRST byte differs (no early-exit short-circuit to true)', () => {
    expect(constantTimeEqual(Uint8Array.of(9, 2, 3), Uint8Array.of(1, 2, 3))).toBe(false);
  });
  it('false when the LAST byte differs (full-length scan)', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 9), Uint8Array.of(1, 2, 3))).toBe(false);
  });
  it('false for different lengths', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
  });
});

describe('createCredentialVerifier / verifyCredential', () => {
  it('verifies the correct credential and rejects a wrong one', async () => {
    const v = await createCredentialVerifier('123456', { params: CHEAP });
    expect(v.salt).toBeInstanceOf(Uint8Array);
    expect(v.salt.length).toBe(16);
    expect(v.hash.length).toBe(32);
    expect(await verifyCredential(v, '123456')).toBe(true);
    expect(await verifyCredential(v, '000000')).toBe(false);
  });

  it('uses a fresh random salt each call', async () => {
    const a = await createCredentialVerifier('pw', { params: CHEAP });
    const b = await createCredentialVerifier('pw', { params: CHEAP });
    expect(constantTimeEqual(a.salt, b.salt)).toBe(false);
  });

  // SPEC test #4 (decoy parity, unit level): the verifier binds to WHATEVER credential
  // created it and never references a "primary". A decoy-opened session therefore
  // verifies the decoy credential and rejects the real one — the property that makes
  // step-up behave identically across session types with no deniability tell.
  it('binds to the captured credential, not any "primary"', async () => {
    const decoyV = await createCredentialVerifier('decoy-pin', { params: CHEAP });
    expect(await verifyCredential(decoyV, 'decoy-pin')).toBe(true);
    expect(await verifyCredential(decoyV, 'real-pin')).toBe(false);
  });

  it('returns false (never throws) when the verifier is null/absent — fail closed', async () => {
    expect(await verifyCredential(null, 'anything')).toBe(false);
    expect(await verifyCredential(undefined, 'anything')).toBe(false);
  });

  // CONFIRMATION #1 (load-bearing): the default verifier params ARE the vault unlock
  // KDF params — never a cheaper set. Runs the real KDF once (~0.5-2s); that's fine.
  it('defaults to the vault KDF_PARAMS (verifier no weaker than the vault)', async () => {
    const v = await createCredentialVerifier('x');
    expect(v.params).toBe(KDF_PARAMS);
  });
});
