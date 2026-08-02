// src/lib/__tests__/stepUpFactorOutcome.test.js
//
// Gap 5 — classify a FAILED step-up possession factor (the OS biometric / hardware
// KEK) into a stable machine code plus the one decision the UI actually needs:
// does this failure count as a wrong-credential ATTEMPT?
//
// WHY THIS EXISTS. The send flow's biometric second factor was:
//
//   try { bioOk = (await verifyBiometric2fa()) === true; } catch { bioOk = false; }
//   return evaluateTwoFactor({ pinOk: true, passwordOk: bioOk, ... });
//
// Fail-closed (the send is blocked) but NOT fail-honest: a USER CANCEL, a
// permanently-invalidated hardware key, and a device with no biometric all collapse
// into the same TWO_FACTOR.WRONG verdict that a genuine no-match produces. That
// verdict burns one of TwoFactorGate's 5 attempts, so five taps on "Cancel" locked
// the session while the UI said "Incorrect." — the exact class of bug that
// WalletEntry.kek-invalidated.test.jsx pins on the unlock screen (a cancel must
// never march a correct-credential user toward a lockout/wipe).
//
// Codes are the contract; copy is not asserted anywhere below.

import { describe, it, expect } from 'vitest';
import {
  STEP_UP_FACTOR,
  classifyStepUpFactorFailure,
} from '@/lib/stepUpFactorOutcome.js';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import { BiometricGateError } from '@/lib/biometric.js';

const withCode = (code) => Object.assign(new Error('opaque'), { code });

describe('classifyStepUpFactorFailure — user cancellation is NOT an attempt', () => {
  it('KEK_ERR.USER_CANCELLED → CANCELLED, countsAsAttempt false', () => {
    const out = classifyStepUpFactorFailure(withCode(KEK_ERR.USER_CANCELLED));
    expect(out.code).toBe(STEP_UP_FACTOR.CANCELLED);
    expect(out.countsAsAttempt).toBe(false);
    expect(out.recoveryRequired).toBe(false);
  });

  it('classifies the code carried on .message alone (bridge re-throw shape)', () => {
    // hardware.js sets both .code and .message; a re-throw across the Capacitor
    // bridge can lose the property bag. Prose is NOT parsed — an exact KEK_ERR
    // value is matched, which is why these are stable codes in the first place.
    const out = classifyStepUpFactorFailure(new Error(KEK_ERR.USER_CANCELLED));
    expect(out.code).toBe(STEP_UP_FACTOR.CANCELLED);
    expect(out.countsAsAttempt).toBe(false);
  });

  it.each(['userCancel', 'systemCancel', 'appCancel', 'userFallback'])(
    'biometric plugin cancel code %s → CANCELLED, countsAsAttempt false',
    (code) => {
      const out = classifyStepUpFactorFailure(withCode(code));
      expect(out.code).toBe(STEP_UP_FACTOR.CANCELLED);
      expect(out.countsAsAttempt).toBe(false);
    },
  );

  it('BiometricGateError("cancelled") → CANCELLED, countsAsAttempt false', () => {
    const out = classifyStepUpFactorFailure(new BiometricGateError('cancelled'));
    expect(out.code).toBe(STEP_UP_FACTOR.CANCELLED);
    expect(out.countsAsAttempt).toBe(false);
  });
});

describe('classifyStepUpFactorFailure — permanently invalidated hardware key', () => {
  it('KEK_ERR.KEY_PERMANENTLY_INVALIDATED → KEY_INVALIDATED, no attempt, recovery required', () => {
    // Same contract WalletEntry already honours: never a wrong-credential attempt,
    // and the only real exit is seed restore.
    const out = classifyStepUpFactorFailure(withCode(KEK_ERR.KEY_PERMANENTLY_INVALIDATED));
    expect(out.code).toBe(STEP_UP_FACTOR.KEY_INVALIDATED);
    expect(out.countsAsAttempt).toBe(false);
    expect(out.recoveryRequired).toBe(true);
  });

  it('is distinguishable from a plain cancel (distinct codes, not one bucket)', () => {
    expect(STEP_UP_FACTOR.KEY_INVALIDATED).not.toBe(STEP_UP_FACTOR.CANCELLED);
  });
});

describe('classifyStepUpFactorFailure — a genuine no-match STILL counts (surgical exemption)', () => {
  it('no error at all (factor resolved false) → MISMATCH, countsAsAttempt true', () => {
    const out = classifyStepUpFactorFailure(null);
    expect(out.code).toBe(STEP_UP_FACTOR.MISMATCH);
    expect(out.countsAsAttempt).toBe(true);
  });

  it('undefined behaves the same as null (factor simply did not verify)', () => {
    expect(classifyStepUpFactorFailure(undefined).countsAsAttempt).toBe(true);
  });

  it('plugin authenticationFailed (wrong finger / wrong face) → MISMATCH, counts', () => {
    const out = classifyStepUpFactorFailure(withCode('authenticationFailed'));
    expect(out.code).toBe(STEP_UP_FACTOR.MISMATCH);
    expect(out.countsAsAttempt).toBe(true);
  });

  it('KEK_ERR.UNWRAP_FAILED (generic wrong-KEK/tamper oracle) → MISMATCH, counts', () => {
    const out = classifyStepUpFactorFailure(withCode(KEK_ERR.UNWRAP_FAILED));
    expect(out.code).toBe(STEP_UP_FACTOR.MISMATCH);
    expect(out.countsAsAttempt).toBe(true);
  });
});

describe('classifyStepUpFactorFailure — unavailable hardware and unknown errors fail closed', () => {
  it.each([
    'biometryNotAvailable',
    'biometryNotEnrolled',
    'biometryNotPresent',
    'passcodeNotSet',
    'biometryLockout',
  ])('plugin availability code %s → UNAVAILABLE, countsAsAttempt false', (code) => {
    const out = classifyStepUpFactorFailure(withCode(code));
    expect(out.code).toBe(STEP_UP_FACTOR.UNAVAILABLE);
    expect(out.countsAsAttempt).toBe(false);
  });

  it.each([KEK_ERR.NO_HARDWARE_FACTOR, KEK_ERR.NO_SET_FACTOR, KEK_ERR.NOT_ENROLLED, KEK_ERR.MALFORMED_VAULT])(
    'KEK availability code %s → UNAVAILABLE, countsAsAttempt false',
    (code) => {
      expect(classifyStepUpFactorFailure(withCode(code)).code).toBe(STEP_UP_FACTOR.UNAVAILABLE);
    },
  );

  it('BiometricGateError("unavailable") → UNAVAILABLE', () => {
    expect(classifyStepUpFactorFailure(new BiometricGateError('unavailable')).code)
      .toBe(STEP_UP_FACTOR.UNAVAILABLE);
  });

  it('an entirely unrecognised error → UNAVAILABLE, never MISMATCH (no invented guilt)', () => {
    // I4: we do not know what happened, so we do not assert the user got it wrong.
    // The action stays BLOCKED either way — only the accounting differs.
    const out = classifyStepUpFactorFailure(new Error('KEK_BIOMETRIC_ERROR:7: something odd'));
    expect(out.code).toBe(STEP_UP_FACTOR.UNAVAILABLE);
    expect(out.countsAsAttempt).toBe(false);
  });

  it('a non-Error throw (string) does not crash the classifier', () => {
    expect(classifyStepUpFactorFailure('boom').code).toBe(STEP_UP_FACTOR.UNAVAILABLE);
  });
});

describe('classifyStepUpFactorFailure — shape contract', () => {
  it('NEVER returns a verdict that permits the action', () => {
    const inputs = [
      null, undefined, 'boom', new Error('x'),
      withCode('userCancel'), withCode('authenticationFailed'),
      withCode(KEK_ERR.KEY_PERMANENTLY_INVALIDATED), withCode(KEK_ERR.NO_HARDWARE_FACTOR),
    ];
    for (const input of inputs) {
      const out = classifyStepUpFactorFailure(input);
      // This helper only ever describes a FAILURE. There is no success code in
      // STEP_UP_FACTOR at all, so it cannot be mistaken for an allow verdict.
      expect(Object.values(STEP_UP_FACTOR)).toContain(out.code);
      expect(out.allowed).toBe(false);
      expect(typeof out.message).toBe('string');
      expect(out.message.length).toBeGreaterThan(0);
    }
  });

  it('STEP_UP_FACTOR is frozen (codes are the contract)', () => {
    expect(Object.isFrozen(STEP_UP_FACTOR)).toBe(true);
  });
});
