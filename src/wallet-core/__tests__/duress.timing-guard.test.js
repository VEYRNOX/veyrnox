// wallet-core/__tests__/duress.timing-guard.test.js
//
// Pins the constant-time guard added to tryDuressUnlock: when NO duress vault is
// configured, the function must still run one full Argon2id KDF pass (via
// encryptVault) before returning null — so the absence of a duress vault is
// timing-indistinguishable from a wrong-password miss.
//
// Mirrors the equivalent guard in stealth.js:tryRevealHidden (~line 539).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearDuressVault, hasDuressVault } from '../duress.js';

beforeEach(async () => {
  try { await clearDuressVault(); } catch { /* noop */ }
  vi.restoreAllMocks();
});

describe('tryDuressUnlock — constant-time guard (no duress vault)', () => {
  it('calls encryptVault with the supplied password when no duress vault is configured', async () => {
    // Spy on encryptVault BEFORE importing tryDuressUnlock so the module sees the spy.
    // We do a dynamic import here to isolate the spy.
    const vaultMod = await import('../vault.js');
    const spy = vi.spyOn(vaultMod, 'encryptVault');

    const { tryDuressUnlock } = await import('../duress.js');

    expect(await hasDuressVault()).toBe(false);
    const result = await tryDuressUnlock('any-password');
    expect(result).toBeNull();

    // The guard must have fired: encryptVault called at least once with the real password.
    // H-2 (2026-08-25): the pad now routes through encryptDeniabilityVault, which
    // supplies a THIRD argument — this device's recorded KDF profile — so that the
    // pad costs what decrypting a real decoy on this device costs. The assertion is
    // widened to admit that argument and then checks it, rather than being loosened:
    // a pad at the wrong work factor is exactly the tell this test exists to catch.
    expect(spy).toHaveBeenCalledWith(
      expect.any(String), // chaff secret — content doesn't matter
      'any-password',     // must use the REAL password so KDF cost is identical
      expect.objectContaining({
        memorySize: expect.any(Number),
        iterations: expect.any(Number),
      }),
    );
    // On a store with no deniability blobs to read an era from, the profile
    // resolves to the current at-rest params (the pre-H-2 behaviour).
    const [, , params] = spy.mock.calls[0];
    expect(params.memorySize).toBe(vaultMod.KDF_PARAMS.memorySize);
    expect(params.iterations).toBe(vaultMod.KDF_PARAMS.iterations);
  });
});
