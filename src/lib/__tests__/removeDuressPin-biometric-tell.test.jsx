// D-05 (LOW) — Biometric pref flag must NOT survive removeDuressPin when biometric
// was configured only for the decoy path (forensic tell).
//
// When the user opts into "Face ID opens the decoy" (enableDecoyBiometricUnlock),
// the shared biometric-unlock pref (veyrnox-biometric-unlock) is flipped ON and the
// DURESS pin is cached behind the gate. removeDuressPin() wipes that cached secret
// (clearUnlockSecret). If the pref is left ON, veyrnox-biometric-unlock = "1" lingers
// in localStorage even though the only reason it was set is now gone — a forensic
// tell that a decoy existed. This test pins that the pref is cleared in that case,
// and left untouched when the PRIMARY wallet independently configured biometric.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

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

const REAL_PIN = '135724680000';
const DURESS_PIN = '246813570000';

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
  setAuthModel('pin');
});
afterEach(() => { cleanup(); clearAuthModel(); });

describe('removeDuressPin clears the decoy-only biometric pref (D-05)', () => {
  it('clears veyrnox-biometric-unlock when biometric was configured ONLY for the decoy', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    await act(async () => { await ctx.enableDecoyBiometricUnlock(DURESS_PIN); });
    expect(isBiometricUnlockEnabled()).toBe(true); // decoy opt-in flipped it on

    await act(async () => { await ctx.removeDuressPin(); });

    // The pref must NOT linger — it existed only because of the decoy opt-in.
    expect(isBiometricUnlockEnabled()).toBe(false);
  });

  it('leaves veyrnox-biometric-unlock ON when the PRIMARY wallet uses biometric unlock', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    // Primary opts into biometric unlock (real pin cached) — independent of any decoy.
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    expect(isBiometricUnlockEnabled()).toBe(true);

    await act(async () => { await ctx.removeDuressPin(); });

    // Primary independently configured biometric → pref stays ON.
    expect(isBiometricUnlockEnabled()).toBe(true);
  });
});
