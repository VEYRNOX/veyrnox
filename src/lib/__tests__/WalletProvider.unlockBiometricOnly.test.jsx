// WalletProvider.unlockBiometricOnly — biometric-only unlock caller (#2019 UI wiring).
//
// Pins the CALLER shape: WalletProvider exposes an unlockBiometricOnly() method that
// - success: hydrates the primary session state (isUnlocked=true) and returns { ok:true }
// - FastpathError: returns { ok:false, fallbackToPin:true, code:'FASTPATH_*' } WITHOUT mounting
// - race-superseded: throws UNLOCK_SUPERSEDED (existing race guard shape)
//
// Keys never leave the keystore seam here — we assert on the OBSERVABLE provider state
// (isUnlocked, wallets) and the CALL to keyStore.unlockBiometricOnly, not on secret bytes.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock('@/api/demoClient', async (orig) => {
  const actual = /** @type {any} */ (await orig());
  return { ...actual, DEMO: false };
});

const SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const unlockBiometricOnlySpy = vi.fn(async () => SEED);
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    isSecureHardwareAvailable: async () => true,
    hasVault: async () => true,
    hasVaultKekWrap: async () => true,
    getHardwareFactor: async () => new Uint8Array(32),
    unlock: async () => SEED,
    unlockBiometricOnly: (...a) => unlockBiometricOnlySpy(...a),
    saveVaultContents: async () => {},
    changePassword: async () => {},
    createVault: async () => {},
    lock: () => {},
    setLockHook: () => {},
    suppressLock: async (fn) => fn(),
  }),
  webKeyStore: {},
  withLockSuppressed: async (fn) => fn(),
}));

import { WalletProvider, useWallet } from '@/lib/WalletProvider';

let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletProvider.unlockBiometricOnly', () => {
  it('exposes unlockBiometricOnly()', async () => {
    await renderProvider();
    expect(typeof ctx.unlockBiometricOnly).toBe('function');
  });

  it('success: mounts wallet (isUnlocked=true) and returns { ok:true }', async () => {
    unlockBiometricOnlySpy.mockResolvedValueOnce(SEED);
    await renderProvider();
    let res;
    await act(async () => { res = await ctx.unlockBiometricOnly(); });
    expect(res).toEqual({ ok: true });
    expect(ctx.isUnlocked).toBe(true);
    expect(ctx.wallets.length).toBeGreaterThan(0);
    expect(unlockBiometricOnlySpy).toHaveBeenCalledTimes(1);
    // Must never receive a password argument.
    const arg0 = unlockBiometricOnlySpy.mock.calls[0][0] || {};
    expect(typeof arg0).toBe('object'); // options object, not a string password
  });

  it('FASTPATH_MISS: returns { ok:false, fallbackToPin:true, code } and does NOT mount', async () => {
    const err = Object.assign(new Error('FASTPATH_MISS'), { code: 'FASTPATH_MISS', name: 'FastpathError' });
    unlockBiometricOnlySpy.mockRejectedValueOnce(err);
    await renderProvider();
    let res;
    await act(async () => { res = await ctx.unlockBiometricOnly(); });
    expect(res).toEqual({ ok: false, fallbackToPin: true, code: 'FASTPATH_MISS' });
    expect(ctx.isUnlocked).toBe(false);
    expect(ctx.wallets.length).toBe(0);
  });

  it('FASTPATH_DENIABILITY_BLOCKED: returns fallbackToPin without mounting (I3 chokepoint)', async () => {
    const err = Object.assign(new Error('FASTPATH_DENIABILITY_BLOCKED'), {
      code: 'FASTPATH_DENIABILITY_BLOCKED', name: 'FastpathError',
    });
    unlockBiometricOnlySpy.mockRejectedValueOnce(err);
    await renderProvider();
    let res;
    await act(async () => { res = await ctx.unlockBiometricOnly(); });
    expect(res.ok).toBe(false);
    expect(res.fallbackToPin).toBe(true);
    expect(res.code).toBe('FASTPATH_DENIABILITY_BLOCKED');
    expect(ctx.isUnlocked).toBe(false);
  });

  it('non-FASTPATH error rethrows (fail-closed; no silent mount)', async () => {
    unlockBiometricOnlySpy.mockRejectedValueOnce(new Error('boom'));
    await renderProvider();
    await expect(
      act(async () => { await ctx.unlockBiometricOnly(); }),
    ).rejects.toThrow(/boom/);
    expect(ctx.isUnlocked).toBe(false);
  });

  it('race guard: a lock() during unlockBiometricOnly rejects with UNLOCK_SUPERSEDED', async () => {
    // Delay the plaintext resolve so lock() can bump the generation mid-flight.
    let releasePlaintext;
    unlockBiometricOnlySpy.mockImplementationOnce(() => new Promise((resolve) => { releasePlaintext = resolve; }));
    await renderProvider();
    let outcome;
    await act(async () => {
      const p = ctx.unlockBiometricOnly().catch((e) => { outcome = e; });
      ctx.lock();
      releasePlaintext(SEED);
      await p;
    });
    expect(outcome).toBeDefined();
    expect(outcome.code).toBe('UNLOCK_SUPERSEDED');
    expect(ctx.isUnlocked).toBe(false);
  });
});
