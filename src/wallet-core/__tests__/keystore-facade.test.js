// wallet-core/__tests__/keystore-facade.test.js
//
// The native KeyStore is reached through a thin SYNCHRONOUS facade
// (keystore/index.js) that delegates to a lazily-imported ./native.js. The facade
// hand-copies the KeyStore method signatures, so a dropped argument is a silent
// drift risk — exactly the bug class that lost the `{ requireBiometric }` opts on
// unlock(). This pins that unlock() forwards its opts through to the native
// KeyStore so the biometric-gate flag can never be silently dropped again.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { unlockSpy } = vi.hoisted(() => ({
  unlockSpy: vi.fn(async () => 'mnemonic-plaintext'),
}));

// Force the native branch of getKeyStore() and stub the lazily-imported native
// KeyStore so no Capacitor plugin code is evaluated.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('../keystore/native.js', () => ({
  nativeKeyStore: { unlock: unlockSpy },
}));

import { getKeyStore } from '../keystore/index.js';

describe('native keystore facade', () => {
  beforeEach(() => unlockSpy.mockClear());

  it('forwards unlock opts (requireBiometric) to the native KeyStore', async () => {
    const ks = getKeyStore();
    await ks.unlock('pw', { requireBiometric: true });
    expect(unlockSpy).toHaveBeenCalledWith('pw', { requireBiometric: true });
  });

  it('forwards a no-opts unlock without crashing (web parity)', async () => {
    const ks = getKeyStore();
    await ks.unlock('pw');
    expect(unlockSpy).toHaveBeenCalledWith('pw', undefined);
  });
});
