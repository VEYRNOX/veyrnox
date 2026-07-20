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

// ---------------------------------------------------------------------------
// H-3 — setDuressPin must NOT leave a PRE-EXISTING REAL-PIN biometric cache live.
//
// The shipped bug this pins: on native, WalletEntry defaults the onboarding
// biometric offer ON, so a brand-new device caches the REAL PIN at wallet
// creation. Setting a Duress PIN afterwards provisioned the decoy vault but
// never touched that cache — so under coercion "just use Face ID" still opened
// the REAL wallet, exactly inverting the promise the duress screen makes (I3
// real-vs-decoy failure at the coercion boundary; I4 copy said the opposite).
//
// These cases seed the vulnerable state the previous suite never modelled: the
// cache is PRE-POPULATED with the real PIN before setDuressPin runs.
// ---------------------------------------------------------------------------
describe('H-3: setDuressPin clears a pre-existing REAL-PIN biometric cache', () => {
  /** Put the device into the shipped default state: biometric ON, REAL pin cached. */
  async function seedRealPinCache() {
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    await act(async () => { await ctx.enableBiometricUnlock(REAL_PIN); });
    expect(_cache).toBe(REAL_PIN);
    expect(isBiometricUnlockEnabled()).toBe(true);
    storeUnlockSecret.mockClear();
    clearUnlockSecret.mockClear();
  }

  it('(f) real PIN cached → setDuressPin WITHOUT decoy opt-in → cache cleared, Face ID cannot open the real wallet', async () => {
    await renderProvider();
    await seedRealPinCache();

    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });

    // The cached REAL pin is gone and the "Face ID is on" pref no longer claims
    // a working one-tap unlock (I4 — the UI must not promise what is not armed).
    expect(clearUnlockSecret).toHaveBeenCalled();
    expect(_cache).toBeNull();
    expect(isBiometricUnlockEnabled()).toBe(false);

    // And the operative behavioural assertion: a coerced Face-ID tap opens nothing.
    await act(async () => { ctx.lock(); });
    let threw = null;
    await act(async () => {
      try { await ctx.unlockWithBiometric(); } catch (e) { threw = e; }
    });
    expect(threw).toBeTruthy();
    expect(ctx.isUnlocked).toBe(false);
  });

  it('(g) real PIN cached → setDuressPin WITH decoy opt-in → cache holds the DECOY pin, Face ID opens the decoy', async () => {
    await renderProvider();
    await seedRealPinCache();

    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });
    await act(async () => { await ctx.enableDecoyBiometricUnlock(DURESS_PIN); });

    expect(_cache).toBe(DURESS_PIN);
    expect(storeUnlockSecret).not.toHaveBeenCalledWith(REAL_PIN);
    expect(isBiometricUnlockEnabled()).toBe(true);

    await act(async () => { ctx.lock(); });
    await act(async () => { await ctx.unlockWithBiometric(); });
    expect(ctx.isUnlocked).toBe(true);
    expect(ctx.isDecoy).toBe(true);
  });

  it('(h) no pre-existing cache → setDuressPin leaves biometric state untouched (no regression)', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    expect(_cache).toBeNull();
    expect(isBiometricUnlockEnabled()).toBe(false);

    await act(async () => { await ctx.setDuressPin(DURESS_PIN); });

    expect(_cache).toBeNull();
    expect(storeUnlockSecret).not.toHaveBeenCalled();
    expect(isBiometricUnlockEnabled()).toBe(false);
  });

  it('(i) fails CLOSED: a secure-store clear failure aborts setDuressPin and disarms one-tap', async () => {
    await renderProvider();
    await seedRealPinCache();

    clearUnlockSecret.mockImplementationOnce(async () => { throw new Error('secure store unavailable'); });

    let threw = null;
    await act(async () => {
      try { await ctx.setDuressPin(DURESS_PIN); } catch (e) { threw = e; }
    });
    // The error is SURFACED, not swallowed: the duress screen shows a failure and
    // never tells the user a duress PIN is protecting them (I4).
    expect(threw).toBeTruthy();
    // The preference is dropped BEFORE the store clear, so even on this failure the
    // entry screen stops offering one-tap unlock of the real wallet.
    expect(isBiometricUnlockEnabled()).toBe(false);
    // HONEST RESIDUAL, pinned deliberately: the secret itself is still at rest in
    // the secure store — JS cannot force its removal when the platform refuses.
    // Aborting loudly is the honest response; this assertion documents the limit
    // rather than pretending the clear succeeded.
    expect(_cache).toBe(REAL_PIN);
  });
});
