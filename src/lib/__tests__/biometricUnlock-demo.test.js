// Tests for the biometric one-tap unlock CACHE (lib/biometricUnlock.js) — DEMO path.
//
// DEMO is forced ON here so the cache lives in localStorage and is gated only by
// the SIMULATED prompt (the real OS biometric sheet is the native path). These
// tests pin the convenience-cache CONTRACT: the vault password can be stored,
// retrieved and cleared. The password remains THE secret and the fallback —
// this module never touches vault crypto. Globals are stubbed explicitly.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  biometricUnlockSupported,
  storeUnlockSecret,
  retrieveUnlockSecret,
  hasStoredUnlockSecret,
  clearUnlockSecret,
} from '@/lib/biometricUnlock';

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

let storage;
beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('biometricUnlock — DEMO (simulated, localStorage cache)', () => {
  it('is supported in demo', () => {
    expect(biometricUnlockSupported()).toBe(true);
  });

  it('stores, retrieves and clears the cached vault password', async () => {
    expect(await hasStoredUnlockSecret()).toBe(false);

    expect(await storeUnlockSecret('correct horse battery staple')).toBe(true);
    expect(await retrieveUnlockSecret()).toBe('correct horse battery staple');
    expect(await hasStoredUnlockSecret()).toBe(true);

    await clearUnlockSecret();
    expect(await retrieveUnlockSecret()).toBe(null);
    expect(await hasStoredUnlockSecret()).toBe(false);
  });

  it('overwrites the cached password (e.g. after a password change)', async () => {
    await storeUnlockSecret('old-password');
    await storeUnlockSecret('new-password');
    expect(await retrieveUnlockSecret()).toBe('new-password');
  });
});
