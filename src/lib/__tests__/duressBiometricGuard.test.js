// H-3 / P1-A — INSTALLED-BASE upgrade guard for the duress ⇄ biometric-cache invariant.
//
// The H-3 fix in WalletProvider.setDuressPin only runs inside FUTURE setDuressPin
// calls. A user who configured their Emergency PIN BEFORE that fix shipped still has
// the REAL PIN sitting in the biometric unlock cache with `veyrnox-biometric-unlock`
// armed — so a coerced "just use Face ID" still opens the REAL wallet. Nothing at
// app start or lock-screen mount re-checked that state, so H-3 stayed live for
// exactly the population that opted into duress protection.
//
// This module is that missing re-check. It is a pure decision + a thin enforcer:
//
//   shouldDisarmBiometricUnlock({biometricEnabled, duressConfigured, decoyCacheMarked})
//     → true ONLY for the vulnerable combination: one-tap unlock armed, a duress PIN
//       DELIBERATELY configured, and no positive evidence that the cached secret is
//       the DECOY's.
//
// The "deliberately configured" signal is `veyrnox-duress-configured` (written only by
// the Emergency-PIN screen when the user saves one, removed when they remove it) — NOT
// hasDuressVault(), which PIN-cohort chaff provisioning makes ALWAYS true (that is the
// exact bug PR #714 fixed by deleting the old guard).
//
// DENIABILITY: every signal read here is a localStorage key that already exists on
// disk (both are already in panic.js's residue list). No new key, no network, no
// user-visible surface. A device with no duress PIN configured short-circuits on the
// first read and performs ZERO writes — byte-identical behaviour to before.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const clearUnlockSecret = vi.fn(async () => {});
vi.mock('@/lib/biometricUnlock', () => ({
  clearUnlockSecret: (...a) => clearUnlockSecret(...a),
}));

import {
  DURESS_CONFIGURED_KEY,
  DECOY_BIOMETRIC_MARKER_KEY,
  isDuressConfigured,
  isDecoyBiometricCache,
  shouldDisarmBiometricUnlock,
  enforceDuressBiometricInvariant,
} from '@/lib/duressBiometricGuard';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometric';

beforeEach(() => {
  clearUnlockSecret.mockClear().mockImplementation(async () => {});
  try { localStorage.clear(); } catch { /* shimmed */ }
});

describe('shouldDisarmBiometricUnlock (pure decision)', () => {
  it('fires ONLY on the vulnerable combination: armed + duress configured + no decoy marker', () => {
    expect(shouldDisarmBiometricUnlock({
      biometricEnabled: true, duressConfigured: true, decoyCacheMarked: false,
    })).toBe(true);
  });

  it('does NOT fire when the cache is positively marked as the DECOY\'s', () => {
    expect(shouldDisarmBiometricUnlock({
      biometricEnabled: true, duressConfigured: true, decoyCacheMarked: true,
    })).toBe(false);
  });

  it('does NOT fire when no duress PIN was deliberately configured', () => {
    expect(shouldDisarmBiometricUnlock({
      biometricEnabled: true, duressConfigured: false, decoyCacheMarked: false,
    })).toBe(false);
  });

  it('does NOT fire when one-tap unlock is not armed (nothing to disarm)', () => {
    expect(shouldDisarmBiometricUnlock({
      biometricEnabled: false, duressConfigured: true, decoyCacheMarked: false,
    })).toBe(false);
  });

  it('treats a non-true biometricEnabled/duressConfigured as absent (no spurious disarm)', () => {
    expect(shouldDisarmBiometricUnlock({})).toBe(false);
    expect(shouldDisarmBiometricUnlock({ biometricEnabled: true })).toBe(false);
  });
});

// NOTE: these spy on `localStorage` (the instance the code actually calls), NOT on
// `Storage.prototype`. Node >= 22 ships an experimental global `localStorage` that
// shadows jsdom's; vitest.setup.js replaces it with a plain in-memory object whose
// methods are OWN properties, so a `Storage.prototype` spy never fires there and the
// fail-closed branches below silently went unexercised — green on CI (node 22), red
// locally (node 26). Spying the instance is environment-independent.
describe('signal readers', () => {
  it('isDuressConfigured reads the deliberate-configuration marker', () => {
    expect(isDuressConfigured()).toBe(false);
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    expect(isDuressConfigured()).toBe(true);
  });

  it('isDuressConfigured FAILS CLOSED (assumes configured) when the signal cannot be read', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try { expect(isDuressConfigured()).toBe(true); } finally { spy.mockRestore(); }
  });

  it('isDecoyBiometricCache reads the decoy marker, and fails closed to false', () => {
    expect(isDecoyBiometricCache()).toBe(false);
    localStorage.setItem(DECOY_BIOMETRIC_MARKER_KEY, '1');
    expect(isDecoyBiometricCache()).toBe(true);

    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    // Fail CLOSED here means "no proof the cache is the decoy's" → disarm.
    try { expect(isDecoyBiometricCache()).toBe(false); } finally { spy.mockRestore(); }
  });
});

describe('enforceDuressBiometricInvariant (installed-base upgrade guard)', () => {
  it('disarms a pre-existing duress + armed-biometric device (the H-3 installed base)', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setBiometricUnlockEnabled(true);

    const disarmed = await enforceDuressBiometricInvariant();

    expect(disarmed).toBe(true);
    expect(isBiometricUnlockEnabled()).toBe(false);
    expect(clearUnlockSecret).toHaveBeenCalled();
  });

  it('is IDEMPOTENT — a second run is a no-op', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setBiometricUnlockEnabled(true);
    await enforceDuressBiometricInvariant();
    clearUnlockSecret.mockClear();

    const second = await enforceDuressBiometricInvariant();

    expect(second).toBe(false);
    expect(clearUnlockSecret).not.toHaveBeenCalled();
  });

  it('leaves a legitimately DECOY-bound biometric cache alone', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    localStorage.setItem(DECOY_BIOMETRIC_MARKER_KEY, '1');
    setBiometricUnlockEnabled(true);

    const disarmed = await enforceDuressBiometricInvariant();

    expect(disarmed).toBe(false);
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(clearUnlockSecret).not.toHaveBeenCalled();
  });

  it('is a ZERO-WRITE no-op for a user who never configured duress (no new tell)', async () => {
    setBiometricUnlockEnabled(true);
    const setItem = vi.spyOn(localStorage, 'setItem');
    const removeItem = vi.spyOn(localStorage, 'removeItem');

    const disarmed = await enforceDuressBiometricInvariant();

    expect(disarmed).toBe(false);
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(clearUnlockSecret).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    setItem.mockRestore(); removeItem.mockRestore();
  });

  it('drops the PREFERENCE first, so a secure-store failure still disarms one-tap (I4)', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setBiometricUnlockEnabled(true);
    clearUnlockSecret.mockImplementationOnce(async () => { throw new Error('secure store unavailable'); });

    // Must not throw on a lock-screen mount path — but must still disarm.
    const disarmed = await enforceDuressBiometricInvariant();

    expect(disarmed).toBe(true);
    expect(isBiometricUnlockEnabled()).toBe(false);
  });
});
