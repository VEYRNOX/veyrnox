import { describe, it, expect } from 'vitest';
import {
  createCredentialVerifier,
  verifyCredential,
  verifyCredentialDetailed,
  constantTimeEqual,
  captureVerifierSafe,
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
  it('false when either array is null/undefined (guarded, no throw)', () => {
    expect(constantTimeEqual(null, Uint8Array.of(1))).toBe(false);
    expect(constantTimeEqual(Uint8Array.of(1), undefined)).toBe(false);
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

  // H5: a null verifier means the per-session verifier was OOM-bricked at unlock
  // (captureVerifierSafe returned null). verifyCredentialDetailed must make that
  // distinguishable from a wrong-password false, so the caller can tell the user WHY
  // re-auth is impossible ("re-lock and unlock") rather than silently failing closed.
  describe('verifyCredentialDetailed (H5 — distinguishable OOM-brick)', () => {
    it('null verifier returns a bricked machine code, not a plain false', async () => {
      expect(await verifyCredentialDetailed(null, 'anything')).toEqual({
        ok: false,
        bricked: true,
        reason: 'VERIFIER_OOM',
      });
      expect(await verifyCredentialDetailed(undefined, 'anything')).toEqual({
        ok: false,
        bricked: true,
        reason: 'VERIFIER_OOM',
      });
    });

    it('correct credential returns { ok: true, bricked: false }', async () => {
      const v = await createCredentialVerifier('123456', { params: CHEAP });
      expect(await verifyCredentialDetailed(v, '123456')).toEqual({ ok: true, bricked: false });
    });

    it('wrong credential returns { ok: false, bricked: false } (NOT bricked)', async () => {
      const v = await createCredentialVerifier('123456', { params: CHEAP });
      expect(await verifyCredentialDetailed(v, '000000')).toEqual({ ok: false, bricked: false });
    });
  });

  it('returns false (never throws) when verifier.params is structurally incomplete', async () => {
    const v = await createCredentialVerifier('123456', { params: CHEAP });
    const broken = { ...v, params: { parallelism: 1, iterations: 1 } }; // missing memorySize/hashLength
    expect(await verifyCredential(broken, '123456')).toBe(false);
  });

  // CONFIRMATION #1 (load-bearing): the default verifier params ARE the vault unlock
  // KDF params — never a cheaper set. Runs the real KDF once (~0.5-2s); that's fine.
  it('defaults to the vault KDF_PARAMS (verifier no weaker than the vault)', async () => {
    const v = await createCredentialVerifier('x');
    expect(v.params).toBe(KDF_PARAMS);
  });
});

describe('captureVerifierSafe (graceful degrade — load-bearing)', () => {
  it('returns the verifier on success', async () => {
    const v = await captureVerifierSafe('123456', { params: CHEAP });
    expect(v).not.toBeNull();
    expect(v.hash.length).toBe(32);
    expect(await verifyCredential(v, '123456')).toBe(true);
  });

  // REGRESSION GUARD for the worst bug in this build: a verifier-KDF failure (e.g.
  // low-memory Argon2id OOM) must NOT propagate out of capture — it returns null so the
  // awaiting unlock() can never be aborted by a downstream verifier failure. This test
  // FAILS (throws) if the try/catch in captureVerifierSafe is removed.
  it('swallows a KDF failure and returns null (never throws)', async () => {
    const throwingCreate = async () => { throw new Error('simulated Argon2id OOM'); };
    // If the try/catch in captureVerifierSafe were removed, this await would REJECT and
    // fail the test — that is the regression guard for the worst bug in this build.
    const result = await captureVerifierSafe('123456', { create: throwingCreate });
    expect(result).toBeNull();
    // And a null verifier fails closed (send path cannot proceed) — not fails open.
    expect(await verifyCredential(result, '123456')).toBe(false);
  });
});
