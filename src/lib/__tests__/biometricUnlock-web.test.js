// Tests for the biometric one-tap unlock CACHE (lib/biometricUnlock.js) — plain
// WEB path (no platform biometric, not demo).
//
// This pins the most important SECURITY invariant of the convenience cache: on a
// platform with no biometric (plain web), NOTHING is ever cached. The vault
// password stays the one and only way in — there is no weaker standalone path.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  biometricUnlockSupported,
  storeUnlockSecret,
  retrieveUnlockSecret,
  retrieveUnlockSecretDirect,
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

describe('biometricUnlock — plain web (no platform biometric)', () => {
  it('is NOT supported on plain web', () => {
    expect(biometricUnlockSupported()).toBe(false);
  });

  it('never caches a password on web — the vault password is the only path', async () => {
    expect(await storeUnlockSecret('whatever')).toBe(false);
    expect(await retrieveUnlockSecret()).toBe(null);
    expect(await hasStoredUnlockSecret()).toBe(false);
    // clearing is a safe no-op even when nothing was ever stored
    await expect(clearUnlockSecret()).resolves.toBeUndefined();
  });

  it('retrieveUnlockSecretDirect also returns null on web (no cached secret to bypass)', async () => {
    // The KEK-only direct path is unreachable on web (no native KEK vault), and even
    // if called must never conjure a secret where none is cached.
    expect(await retrieveUnlockSecretDirect()).toBe(null);
  });
});
