// Face-ID-opens-the-DECOY wiring (target item 3).
//
// In the PIN cohort the user may OPT IN, while setting the Duress PIN, to
// "Use Face ID to open the decoy." When enabled, the biometric cache holds the
// DURESS PIN (never the real one), so a Face-ID unlock routes to the DECOY wallet
// and the real wallet is reachable only by typing the real PIN. This pins:
//
//   (a) enableDecoyBiometricUnlock(duressPin) caches the DURESS pin (NOT the real
//       pin) and turns biometric unlock ON — PIN cohort + biometrics available.
//   (b) unlockWithBiometric() then opens the DECOY (isDecoy === true).
//   (c) the REAL pin still opens the REAL wallet (isDecoy === false).
//   (d) without opting in, NO biometric secret is stored.
//   (e) honest-disable: outside the PIN cohort, enableDecoyBiometricUnlock stores
//       nothing and returns false (Face-ID-for-decoy is a PIN-cohort feature).
//
// We exercise the REAL WalletProvider, the REAL duress vault, and the REAL unlock
// routing. Only the storage/biometric LAYER is mocked (as the existing biometric
// tests do): an in-memory cache stands in for the hardware-backed secure store,
// and getBiometricStatus reports an available native sensor with no real OS prompt.
// The cached SECRET is the contract under test — so we assert exactly which secret
// storeUnlockSecret received.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// In-memory stand-in for the biometric-gated secure store. retrieveUnlockSecret
// returns whatever storeUnlockSecret last cached — so a Face-ID unlock replays the
// cached secret, exactly like the native chokepoint releasing the cached password.
let _cache = null;
const storeUnlockSecret = vi.fn(async (secret) => { _cache = secret; return true; });
const retrieveUnlockSecret = vi.fn(async () => _cache);
const clearUnlockSecret = vi.fn(async () => { _cache = null; });

vi.mock('@/lib/biometricUnlock', () => ({
  storeUnlockSecret: (...a) => storeUnlockSecret(...a),
  retrieveUnlockSecret: (...a) => retrieveUnlockSecret(...a),
  clearUnlockSecret: (...a) => clearUnlockSecret(...a),
  hasStoredUnlockSecret: vi.fn(async () => _cache != null),
  biometricUnlockSupported: () => true,
}));

// Report an available NATIVE biometric so enable/unlock take the real-device
// branch (no demo simulated prompt, no real OS call) in the test env.
vi.mock('@/lib/biometric', async (orig) => {
  const actual = /** @type {any} */ (await orig());
  return {
    ...actual,
    getBiometricStatus: vi.fn(async () => ({
      mode: 'native', available: true, label: 'Face ID', simulated: false,
      detail: 'Face ID is set up on this device.',
    })),
  };
});

import { WalletProvider, useWallet } from '@/lib/WalletProvider';
import { setAuthModel, clearAuthModel } from '@/lib/authModel';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometric';

// 12-char minimum enforced by H-A (validateWebVaultPassword) on web mainnet builds.
const REAL_PIN = '135724680000';
const DURESS_PIN = '246813570000';

// Capture the live wallet context so tests can call provider methods directly.
let ctx;
function Capture() { ctx = useWallet(); return null; }

async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

beforeEach(() => {
  _cache = null;
  storeUnlockSecret.mockClear();
  retrieveUnlockSecret.mockClear();
  clearUnlockSecret.mockClear();
  try { localStorage.clear(); } catch { /* shimmed */ }
  setBiometricUnlockEnabled(false);
  setAuthModel('pin'); // the PIN cohort: where Face-ID-for-decoy lives
});
afterEach(() => { cleanup(); clearAuthModel(); });

describe('Face ID opens the DECOY (PIN cohort opt-in)', () => {
  it('(a) caches the DURESS pin — never the real pin — and turns biometric ON', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });

    const ok = await act(async () => ctx.enableDecoyBiometricUnlock(DURESS_PIN));
    expect(ok).toBe(true);

    // The cached secret is the DURESS pin, and the REAL pin was never stored.
    expect(storeUnlockSecret).toHaveBeenCalledWith(DURESS_PIN);
    expect(storeUnlockSecret).not.toHaveBeenCalledWith(REAL_PIN);
    expect(isBiometricUnlockEnabled()).toBe(true);
  });

  it('(b) unlockWithBiometric opens the DECOY (isDecoy true)', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    await act(async () => { await ctx.enableDecoyBiometricUnlock(DURESS_PIN); });
    await act(async () => { ctx.lock(); });

    await act(async () => { await ctx.unlockWithBiometric(); });

    expect(ctx.isUnlocked).toBe(true);
    expect(ctx.isDecoy).toBe(true); // Face ID → decoy, by design
  });

  it('(c) the REAL pin still opens the REAL wallet (isDecoy false)', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    await act(async () => { await ctx.enableDecoyBiometricUnlock(DURESS_PIN); });
    await act(async () => { ctx.lock(); });

    await act(async () => { await ctx.unlock(REAL_PIN); });

    expect(ctx.isUnlocked).toBe(true);
    expect(ctx.isDecoy).toBe(false); // typed real PIN → real wallet
  });

  it('(d) when NOT opted in, no biometric secret is stored', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    // No enableDecoyBiometricUnlock call.

    expect(storeUnlockSecret).not.toHaveBeenCalled();
    expect(isBiometricUnlockEnabled()).toBe(false);
  });

  it('(e) outside the PIN cohort the option is honest-disabled (stores nothing, returns false)', async () => {
    setAuthModel('password');
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });

    const ok = await act(async () => ctx.enableDecoyBiometricUnlock(DURESS_PIN));
    expect(ok).toBe(false);
    expect(storeUnlockSecret).not.toHaveBeenCalled();
    expect(isBiometricUnlockEnabled()).toBe(false);
  });
});
