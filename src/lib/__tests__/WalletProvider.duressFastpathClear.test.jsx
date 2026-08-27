// H-1 (fast-path cache vs duress) + L-9 (stale real PIN after a PIN change).
// Weekly audit 2026-08-25.
//
// H-1: the #2019 fast-path wrapped-DEK cache is a SECOND one-tap door beside
// the legacy `veyrnox-biometric-unlock` cache, and the duress teardown only
// ever knew about the first one. `setBiometricUnlockEnabled(false)` +
// `clearUnlockSecret()` leave the fast-path alias warm, so after configuring an
// Emergency PIN a coercer could still tap the fingerprint button and open the
// REAL vault (WalletProvider.unlockBiometricOnly mounts the primary session:
// `setIsDecoy(false)`). Both duress chokepoints — setDuressPin (configuration
// time) and enforceDuressBiometricInvariant (lock-screen mount, the installed
// base) — must now clear it too.
//
// L-9: in the PIN cohort `changePassword` deliberately does NOT re-cache the
// new PIN (caching the REAL PIN behind Face ID is the H-3 bypass), but it also
// never cleared the OLD one — leaving a plaintext credential at rest that the
// user may have reused elsewhere.
//
// Harness follows duress-biometric-decoy.test.jsx: REAL WalletProvider, REAL
// duress vault, REAL unlock routing; only the storage/biometric LAYER stands
// in. The fast-path alias is an in-memory slot so "is the wrapped DEK still
// there" is asserted on the slot itself, not on a spy call count alone.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// In-memory stand-in for the legacy biometric-gated secure store.
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
  hasBiometricConsentBeenRecorded: () => true,
}));

// In-memory stand-in for the Android Keystore fast-path alias (#2019).
let _fastpathSlot = null;
const putFastpathDek = vi.fn(async (wrappedDek) => { _fastpathSlot = wrappedDek; });
const getFastpathDek = vi.fn(async () => _fastpathSlot);
const clearFastpathDek = vi.fn(async () => { _fastpathSlot = null; });
vi.mock('@/plugins/androidBiometricCache', () => ({
  putFastpathDek: (...a) => putFastpathDek(...a),
  getFastpathDek: (...a) => getFastpathDek(...a),
  clearFastpathDek: (...a) => clearFastpathDek(...a),
}));

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
import { setBiometricUnlockEnabled } from '@/lib/biometric';
import {
  DURESS_CONFIGURED_KEY, enforceDuressBiometricInvariant,
} from '@/lib/duressBiometricGuard';

// 12-char minimum enforced by H-A (validateWebVaultPassword) on web mainnet builds.
const REAL_PIN = '135724680000';
const NEW_PIN = '975312460000';
const DURESS_PIN = '246813570000';

// Stand-in for a warm alias: the real payload is a JSON fastpath wrap blob, but
// nothing under test parses it — what matters is whether the slot is empty.
const WARM = JSON.stringify({ v: 1, iv: 'AAAA', ct: 'BBBB' });

let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

beforeEach(() => {
  _cache = null;
  _fastpathSlot = null;
  storeUnlockSecret.mockClear();
  retrieveUnlockSecret.mockClear();
  clearUnlockSecret.mockClear();
  putFastpathDek.mockClear();
  getFastpathDek.mockClear();
  clearFastpathDek.mockClear();
  try { localStorage.clear(); } catch { /* shimmed */ }
  setBiometricUnlockEnabled(false);
  setAuthModel('pin');
});
afterEach(() => { cleanup(); clearAuthModel(); });

describe('H-1: configuring a duress PIN disarms the fast-path wrapped-DEK cache', () => {
  it('setDuressPin empties a warm fast-path alias', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    _fastpathSlot = WARM; // a previous real-PIN unlock warmed it

    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });

    expect(_fastpathSlot).toBeNull();
    expect(clearFastpathDek).toHaveBeenCalled();
  });

  it('enforceDuressBiometricInvariant empties it for the INSTALLED BASE — including devices whose legacy one-tap was never armed', async () => {
    // The legacy guard returns early when `veyrnox-biometric-unlock` is off,
    // but the fast path is armed independently of that preference: a user who
    // never enabled Face-ID-for-unlock can still have a warm fast-path alias.
    // Gating the sweep behind the legacy `armed` check would miss exactly that
    // cohort, which is the one this guard exists to catch.
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setBiometricUnlockEnabled(false);
    _fastpathSlot = WARM;

    await act(async () => { await enforceDuressBiometricInvariant(); });

    expect(_fastpathSlot).toBeNull();
  });

  it('leaves the alias alone when no duress PIN is configured (no new behaviour for everyone else)', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    _fastpathSlot = WARM;

    await act(async () => { await enforceDuressBiometricInvariant(); });

    expect(_fastpathSlot).toBe(WARM);
    expect(clearFastpathDek).not.toHaveBeenCalled();
  });
});

describe('L-9: changePassword does not leave the previous REAL PIN in the biometric cache', () => {
  it('PIN cohort — the stale old PIN is cleared rather than silently left at rest', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });
    expect(_cache).toBe(REAL_PIN);

    await act(async () => { await ctx.changePassword(REAL_PIN, NEW_PIN); });

    // Neither the old PIN (stale plaintext credential) nor the new one (which
    // would be the H-3 Face-ID-opens-the-real-wallet bypass) may remain.
    expect(_cache).toBeNull();
    expect(storeUnlockSecret).not.toHaveBeenCalledWith(NEW_PIN);
  });

  it('password cohort — still re-caches the NEW password (unchanged behaviour)', async () => {
    setAuthModel('password');
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });

    await act(async () => { await ctx.changePassword(REAL_PIN, NEW_PIN); });

    expect(_cache).toBe(NEW_PIN);
  });
});
