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
import { setAuthModel, clearAuthModel, shouldAutoCacheTypedPin } from '@/lib/authModel';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometric';
import {
  DURESS_CONFIGURED_KEY, isDuressConfigured, enforceDuressBiometricInvariant,
} from '@/lib/duressBiometricGuard';

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

  // H-3 CORRECTION (P1-B). This case originally armed the primary's biometric unlock
  // and THEN set the duress PIN, asserting the pref survived — i.e. it encoded the
  // H-3 coercion bypass (REAL pin cached behind Face ID with a duress PIN configured)
  // as REQUIRED behaviour. A first correction pass replaced it with "the primary
  // re-arms after duress setup, pref must be ON", which is the same bypass one step
  // later: the re-armed pref makes the next real-PIN unlock re-cache the REAL pin.
  //
  // D-05's actual property is narrower than either version: removeDuressPin must
  // retract the shared pref ONLY when the decoy opt-in was the sole reason it was on.
  // That discrimination is what this case pins, in a state that is legitimate — no
  // duress PIN was DELIBERATELY configured (no veyrnox-duress-configured marker; the
  // provider-level setDuressPin here stands in for the chaff/decoy blob that exists on
  // every PIN device). The vulnerable variant — the same re-arm WITH duress
  // deliberately configured — is pinned as DISALLOWED by the case below.
  it('leaves veyrnox-biometric-unlock ON when the PRIMARY configured biometric independently', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    // No decoy opt-in → no decoy marker. The primary's own biometric unlock.
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });
    expect(isBiometricUnlockEnabled()).toBe(true);

    await act(async () => { await ctx.removeDuressPin(); });

    // Primary independently configured biometric → pref stays ON (the documented
    // re-arm path). Only the decoy-only case above may retract it.
    expect(isBiometricUnlockEnabled()).toBe(true);
  });

  // H-3 / P1-B — the true invariant the old case denied: WHILE a duress PIN is
  // DELIBERATELY configured, primary biometric unlock must never hold the REAL pin.
  it('does NOT let a re-armed REAL-pin cache survive while a duress PIN is configured', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1'); // what the Emergency-PIN screen writes

    // The user re-arms biometric unlock for the REAL wallet (Settings toggle).
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });
    expect(_cache).toBe(REAL_PIN);

    // 1. The lock-screen/start guard disarms it — Face ID cannot open the real wallet.
    await act(async () => { await enforceDuressBiometricInvariant(); });
    expect(isBiometricUnlockEnabled()).toBe(false);
    expect(_cache).toBeNull();

    // 2. …and the next successful real-PIN unlock must NOT silently re-cache it.
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: true, alreadyCached: false, duressConfigured: isDuressConfigured(),
    })).toBe(false);
  });
});
