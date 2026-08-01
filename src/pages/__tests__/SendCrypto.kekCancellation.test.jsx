// src/pages/__tests__/SendCrypto.kekCancellation.test.jsx
//
// Gap 5 — USER_CANCELLED / KEY_PERMANENTLY_INVALIDATED on the SEND re-auth path.
//
// WHERE THE HARDWARE PROMPT ACTUALLY FIRES DURING A SEND (verified by reading the
// code, not assumed):
//   * The windowed step-up (`submitReauth` → `verifyActiveCredentialDetailed`) is an
//     Argon2id verification against the in-session verifier. It touches NO hardware
//     KEK, so a KEK code cannot arise there today — but it had a `try/finally` with
//     NO `catch`, so a rejection escaped as an unhandled rejection: no error shown,
//     no attempt counted, send silently dead-ended. Pinned below.
//   * The BIOMETRIC second factor (`send2faMethod === SEND_2FA.BIOMETRIC`) is the
//     path that raises the OS sheet mid-send. That is where a cancel / permanently
//     invalidated key / plugin rejection actually lands.
//   * Signing itself uses the in-memory mnemonic (`withPrivateKey`), so it raises no
//     prompt. This file deliberately does NOT pretend otherwise.
//
// THE BUG. The biometric leg was:
//     try { bioOk = (await verifyBiometric2fa()) === true; } catch { bioOk = false; }
//     return evaluateTwoFactor({ pinOk: true, passwordOk: bioOk, ... });
// Fail-CLOSED (the send is blocked) but not fail-HONEST: cancel, dead hardware key,
// and "this device has no biometric" all collapsed into the same TWO_FACTOR.WRONG
// verdict a genuine no-match produces — and TwoFactorGate burns one of its 5
// attempts on that verdict, calling onLock() on the fifth. So five taps on the OS
// "Cancel" button locked the session, captioned "Incorrect."
//
// That is the send-flow twin of the invariant WalletEntry.kek-invalidated.test.jsx
// pins on the unlock screen: a user who cancels a biometric sheet must never march
// toward a lockout/wipe, because a cancel is not a wrong credential.
//
// The exemption is SURGICAL — a real biometric no-match still counts (last block).
//
// Codes are asserted; copy is not.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('@/lib/haptics', () => ({
  errorHaptic: vi.fn(), successHaptic: vi.fn(), actionHaptic: vi.fn(),
}));
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', setAuthModel: vi.fn() }));

import TwoFactorGate from '@/components/security/TwoFactorGate';
import {
  STEP_UP_FACTOR,
  evaluateBiometricSecondFactor,
} from '@/lib/stepUpFactorOutcome.js';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import { TWO_FACTOR } from '@/lib/twoFactorGate.js';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

// The wrong-PIN → panic-wipe counter. The send path must never touch it; asserted
// explicitly because "does not increment the wipe counter" is the headline claim.
const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';

const ATTEMPT_CAP = 5; // TwoFactorGate's cap; onLock fires on the CAP-th counted miss.

const withCode = (code) => Object.assign(new Error('opaque'), { code });

/**
 * Mount the real TwoFactorGate in biometric mode wired to the REAL production
 * second-factor evaluator, with only the OS call itself faked. Nothing about the
 * decision is re-implemented here — a regression in the production helper fails
 * this test.
 */
function mountBiometricGate(runBiometric) {
  const onSuccess = vi.fn();
  const onLock = vi.fn();
  render(
    <TwoFactorGate
      mode="biometric"
      verify={() => evaluateBiometricSecondFactor(runBiometric)}
      onSuccess={onSuccess}
      onLock={onLock}
    />,
  );
  const submit = screen.getByRole('button', { name: /verify with biometrics/i });
  return { onSuccess, onLock, submit };
}

/**
 * Tap "Verify" `times` times, waiting for each attempt to fully settle. Waiting on
 * the OS-call mock (not just on the button) is deliberate: the button is only
 * disabled while `busy`, and a click landing inside that window is dropped — which
 * would make an attempt-cap assertion pass for the wrong reason.
 */
async function tapVerify(submit, bio, times) {
  for (let i = 0; i < times; i += 1) {
    fireEvent.click(submit);
    // eslint-disable-next-line no-await-in-loop
    await waitFor(() => expect(bio).toHaveBeenCalledTimes(i + 1));
    // eslint-disable-next-line no-await-in-loop
    await waitFor(() => expect(submit).not.toBeDisabled());
  }
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); });

// ── USER_CANCELLED ──────────────────────────────────────────────────────────

describe('SendCrypto biometric step-up — USER_CANCELLED aborts the send without penalty', () => {
  it('a cancelled biometric never authorises the send', async () => {
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.USER_CANCELLED); });
    const { onSuccess, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, 1);

    expect(bio).toHaveBeenCalledTimes(1);
    // onSuccess is the ONLY route to sendTx.mutate() in the 2FA branch of
    // SendCrypto (`onSuccess={() => { ...; sendTx.mutate(); }}`), so a gate that
    // never calls it cannot have broadcast anything.
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces an error to the user rather than dead-ending silently', async () => {
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.USER_CANCELLED); });
    const { submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, 1);

    // Structure, not copy: an assertive/polite alert must exist.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('cancelling MORE than the attempt cap still does not lock the session', async () => {
    // The headline regression: five cancels used to reach onLock().
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.USER_CANCELLED); });
    const { onSuccess, onLock, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, ATTEMPT_CAP + 1);

    expect(bio).toHaveBeenCalledTimes(ATTEMPT_CAP + 1);
    expect(onLock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does NOT increment the wrong-PIN wipe counter', async () => {
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.USER_CANCELLED); });
    const { submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, ATTEMPT_CAP + 1);

    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
  });

  it('returns the CANCELLED code and a non-counting verdict (machine contract)', async () => {
    const verdict = await evaluateBiometricSecondFactor(async () => {
      throw withCode(KEK_ERR.USER_CANCELLED);
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe(STEP_UP_FACTOR.CANCELLED);
    expect(verdict.neutral).toBe(true);
  });

  it('the plugin-level userCancel code is treated identically', async () => {
    const verdict = await evaluateBiometricSecondFactor(async () => {
      throw withCode('userCancel');
    });
    expect(verdict.code).toBe(STEP_UP_FACTOR.CANCELLED);
    expect(verdict.neutral).toBe(true);
    expect(verdict.allowed).toBe(false);
  });
});

// ── KEY_PERMANENTLY_INVALIDATED ─────────────────────────────────────────────

describe('SendCrypto biometric step-up — KEY_PERMANENTLY_INVALIDATED blocks the send', () => {
  it('blocks the send and never reaches onSuccess', async () => {
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.KEY_PERMANENTLY_INVALIDATED); });
    const { onSuccess, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, 1);

    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('does not lock the session or touch the wipe counter on repeated attempts', async () => {
    // The hardware key is dead; retrying can never succeed. Punishing the user for
    // that with a lockout (and a "wrong credential" caption) is dishonest — the
    // same reasoning WalletEntry applies when it routes to seed recovery instead.
    const bio = vi.fn(async () => { throw withCode(KEK_ERR.KEY_PERMANENTLY_INVALIDATED); });
    const { onLock, onSuccess, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, ATTEMPT_CAP + 1);

    expect(onLock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
  });

  it('is reported as its OWN code with recoveryRequired set (not folded into cancel)', async () => {
    const verdict = await evaluateBiometricSecondFactor(async () => {
      throw withCode(KEK_ERR.KEY_PERMANENTLY_INVALIDATED);
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe(STEP_UP_FACTOR.KEY_INVALIDATED);
    expect(verdict.recoveryRequired).toBe(true);
    expect(verdict.neutral).toBe(true);
  });
});

// ── Generic plugin rejection ────────────────────────────────────────────────

describe('SendCrypto biometric step-up — generic plugin rejection fails CLOSED', () => {
  it.each([
    ['unclassified bridge error', new Error('KEK_BIOMETRIC_ERROR:7: Too many attempts')],
    ['no hardware factor', withCode(KEK_ERR.NO_HARDWARE_FACTOR)],
    ['biometry not enrolled', withCode('biometryNotEnrolled')],
    ['non-Error throw', 'boom'],
  ])('%s blocks the send', async (_label, thrown) => {
    const bio = vi.fn(async () => { throw thrown; });
    const { onSuccess, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, 1);

    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('a factor that resolves a NON-true value also blocks (no truthiness slip)', async () => {
    // `=== true` is the contract: 'yes', 1 and {} must not authorise a send.
    for (const value of ['yes', 1, {}, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      const verdict = await evaluateBiometricSecondFactor(async () => value);
      expect(verdict.allowed).toBe(false);
    }
  });
});

// ── The exemption must stay SURGICAL ────────────────────────────────────────

describe('SendCrypto biometric step-up — a genuine no-match still counts toward the cap', () => {
  it('authenticationFailed produces a counting WRONG verdict', async () => {
    const verdict = await evaluateBiometricSecondFactor(async () => {
      throw withCode('authenticationFailed');
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe(TWO_FACTOR.WRONG);
    // Not neutral → TwoFactorGate burns an attempt, exactly as before.
    expect(verdict.neutral).toBeFalsy();
  });

  it('five real no-matches still reach onLock (the cap is not disabled)', async () => {
    // Guards against "fix the cancel bug by never counting anything", which would
    // silently delete the rate limit rather than correct its classification.
    const bio = vi.fn(async () => { throw withCode('authenticationFailed'); });
    const { onLock, onSuccess, submit } = mountBiometricGate(bio);

    await tapVerify(submit, bio, ATTEMPT_CAP);

    await waitFor(() => expect(onLock).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('a successful biometric still authorises the send', async () => {
    // The happy path must survive the change.
    const bio = vi.fn(async () => true);
    const { onSuccess, onLock, submit } = mountBiometricGate(bio);

    fireEvent.click(submit);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onLock).not.toHaveBeenCalled();
  });
});

// ── Wiring pins on SendCrypto.jsx ───────────────────────────────────────────
//
// SendCrypto is pinned by source in this codebase (a full render needs the entire
// send stack — see SendCrypto.confirmation.test.js / SendCrypto.deniability.test.jsx).
// These pins exist only to prove the page routes through the helper the behavioural
// blocks above actually exercise; the behaviour itself is tested for real.

describe('SendCrypto.jsx — the biometric leg routes through the classified evaluator', () => {
  it('imports evaluateBiometricSecondFactor', () => {
    expect(src).toMatch(/import\s*\{[^}]*evaluateBiometricSecondFactor[^}]*\}\s*from\s*["']@\/lib\/stepUpFactorOutcome/);
  });

  it('the SEND_2FA.BIOMETRIC branch calls it instead of swallowing the error inline', () => {
    // Bounded exactly by the two sibling branches so the slice cannot drift with
    // comment length (the whole point of the pin is the CALL, not the prose).
    const start = src.indexOf('if (send2faMethod === SEND_2FA.BIOMETRIC)');
    const end = src.indexOf('if (send2faMethod === SEND_2FA.PASSKEY)');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = src.slice(start, end);
    expect(branch).toMatch(/evaluateBiometricSecondFactor\(\s*verifyBiometric2fa\s*\)/);
    // The old bare `catch { bioOk = false; }` swallow must be gone from this branch.
    expect(branch).not.toMatch(/catch\s*\{\s*bioOk\s*=\s*false;?\s*\}/);
    // …and it must not have been "fixed" by re-inlining evaluateTwoFactor with a
    // hardcoded passwordOk, which would restore the indistinguishable verdict.
    expect(branch).not.toMatch(/evaluateTwoFactor\(/);
  });

  it('TwoFactorGate honours the neutral (non-counting) verdict', () => {
    const gate = readFileSync(
      join(dir, '../../components/security/TwoFactorGate.jsx'), 'utf8',
    );
    // The pre-existing `oom` escape hatch must remain, with `neutral` added beside
    // it — not replacing it (audit-H5 depends on `oom`).
    expect(gate).toMatch(/verdict\?\.oom\s*\|\|\s*verdict\?\.neutral|verdict\?\.neutral\s*\|\|\s*verdict\?\.oom/);
    const capIdx = gate.indexOf('const n = attempts + 1');
    const neutralIdx = gate.search(/verdict\?\.neutral/);
    // The non-counting return must come BEFORE the attempt increment.
    expect(neutralIdx).toBeGreaterThan(-1);
    expect(neutralIdx).toBeLessThan(capIdx);
  });
});

// Bounded by the next declaration so the slice cannot drift with comment length.
function submitReauthSource() {
  const start = src.indexOf('const submitReauth');
  const end = src.indexOf('const resetVerify');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('SendCrypto.jsx — submitReauth cannot dead-end silently on a thrown verifier', () => {
  it('wraps the step-up verification in try/catch, not just try/finally', () => {
    const fn = submitReauthSource();
    expect(fn).toMatch(/verifyActiveCredentialDetailed/);
    // Before: `try { ... } finally { ... }` — a rejection escaped as an unhandled
    // rejection with no message and no state change.
    expect(fn).toMatch(/\}\s*catch\s*(\([^)]*\))?\s*\{/);
  });

  it('the catch surfaces an error and never falls through to sendTx.mutate()', () => {
    const fn = submitReauthSource();
    const catchIdx = fn.search(/\}\s*catch\s*(\([^)]*\))?\s*\{/);
    const finallyIdx = fn.indexOf('} finally', catchIdx + 1);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
    const catchBlock = fn.slice(catchIdx, finallyIdx);
    expect(catchBlock).toMatch(/setReauthError\(/);
    // An unverified step-up must never authorise a broadcast (I4).
    expect(catchBlock).not.toMatch(/sendTx\.mutate\(\)/);
    // A thrown verifier is infra failure, not a wrong credential — it must not
    // burn a step-up attempt nor trip the 5-attempt lock.
    expect(catchBlock).not.toMatch(/setReauthAttempts\(/);
    expect(catchBlock).not.toContain('lock()');
  });
});
