// wallet-core/__tests__/keystore-facade.test.js
//
// The native KeyStore is reached through a thin SYNCHRONOUS facade
// (keystore/index.js) that delegates to a lazily-imported ./native.js. The facade
// hand-copies the KeyStore method signatures, so a dropped argument is a silent
// drift risk — exactly the bug class that lost the `{ requireBiometric }` opts on
// unlock(). This pins that unlock() forwards its opts through to the native
// KeyStore so the biometric-gate flag can never be silently dropped again.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { unlockSpy, getHardwareFactorSpy } = vi.hoisted(() => ({
  unlockSpy: vi.fn(async () => 'mnemonic-plaintext'),
  getHardwareFactorSpy: vi.fn(async () => new Uint8Array(32).fill(1)),
}));

// Force the native branch of getKeyStore() and stub the lazily-imported native
// KeyStore so no Capacitor plugin code is evaluated.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('../keystore/native.js', () => ({
  nativeKeyStore: { unlock: unlockSpy, getHardwareFactor: getHardwareFactorSpy },
}));

import { getKeyStore } from '../keystore/index.js';

describe('native keystore facade', () => {
  beforeEach(() => { unlockSpy.mockClear(); getHardwareFactorSpy.mockClear(); });

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

  // C-1 regression (2026-07-05): the facade's getHardwareFactor() dropped ALL args,
  // so the v2 { kekSalt } binding never reached native.js — every enrolled vault fell
  // back to the fixed v1 salt. Pin that opts are forwarded verbatim (never dropped).
  it('forwards getHardwareFactor opts ({ kekSalt }) to the native KeyStore', async () => {
    const ks = getKeyStore();
    const kekSalt = new Uint8Array(32).fill(5);
    await ks.getHardwareFactor({ kekSalt });
    expect(getHardwareFactorSpy).toHaveBeenCalledWith({ kekSalt });
  });

  it('forwards a no-arg getHardwareFactor as undefined (v1 legacy path)', async () => {
    const ks = getKeyStore();
    await ks.getHardwareFactor();
    expect(getHardwareFactorSpy).toHaveBeenCalledWith(undefined);
  });
});
