// src/lib/stepUpFactorOutcome.js
//
// Classify a FAILED step-up POSSESSION factor (the OS biometric sheet / the
// hardware-KEK bridge) into a stable machine code plus the one decision the UI
// needs: does this failure count as a wrong-credential ATTEMPT?
//
// WHY. Critical-action gates (send, reveal, duress setup) cap wrong attempts and
// then lock the session. That cap is a rate limit on GUESSING. A user who taps
// "Cancel" on the OS sheet has guessed nothing; neither has a user whose Android
// hardware key was permanently invalidated when they changed their fingerprints,
// nor a user on a device with no biometric at all. Collapsing those into the same
// "wrong credential" verdict is fail-CLOSED but not fail-HONEST (I4): the action
// is correctly blocked, but the user is told they got it wrong and is marched
// toward a lockout they cannot avoid by being more careful.
//
// This is the send-flow twin of the exemption WalletEntry already applies on the
// unlock screen, where the same class of bug reached the PANIC WIPE
// (see src/components/__tests__/WalletEntry.kek-invalidated.test.jsx and
// src/wallet-core/keystore/__tests__/hardware.plugin-rejection.test.js, which
// produce the stable codes consumed here).
//
// THE EXEMPTION IS SURGICAL. A genuine biometric no-match (`authenticationFailed`)
// still counts. Nothing here ever ALLOWS an action — every outcome blocks; only the
// accounting and the message differ.
//
// Codes are the contract; the copy below is not asserted by any test.
// Pure module: no I/O, no React, no crypto. The impure OS call is injected.

import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import { isBiometricGateError } from '@/lib/biometric.js';
import { evaluateTwoFactor } from '@/lib/twoFactorGate.js';

export const STEP_UP_FACTOR = Object.freeze({
  /** The factor genuinely did not match. This IS a wrong attempt. */
  MISMATCH: 'STEP_UP_FACTOR_MISMATCH',
  /** The user (or the OS, on their behalf) dismissed the prompt. Not an attempt. */
  CANCELLED: 'STEP_UP_FACTOR_CANCELLED',
  /** The hardware key can never produce H again — only a seed restore recovers. */
  KEY_INVALIDATED: 'STEP_UP_FACTOR_KEY_INVALIDATED',
  /** Hardware/plugin cannot answer right now (or at all). Not an attempt. */
  UNAVAILABLE: 'STEP_UP_FACTOR_UNAVAILABLE',
});

// @aparajita/capacitor-biometric-auth dismissal codes, plus the KEK bridge's
// classified cancel (hardware.js maps the Kotlin "User cancelled" string to it).
// `userFallback` is the user choosing "Use passcode" and then backing out — a
// dismissal, not a failed match.
const CANCEL_CODES = new Set([
  'userCancel', 'systemCancel', 'appCancel', 'userFallback',
  KEK_ERR.USER_CANCELLED,
]);

// The factor was actually presented and actually did not match.
const MISMATCH_CODES = new Set([
  'authenticationFailed',
  // Deliberately generic wrong-KEK/tamper result — kek.js keeps it an opaque
  // oracle, and "the wrap did not open" is the closest thing to a no-match.
  KEK_ERR.UNWRAP_FAILED,
]);

// The factor could not be presented. `biometryLockout` belongs here rather than in
// MISMATCH: the OS has already rate-limited the user, and adding our own attempt on
// top double-penalises a lockout they cannot clear by retrying.
const UNAVAILABLE_CODES = new Set([
  'biometryNotAvailable', 'biometryNotEnrolled', 'biometryNotPresent',
  'passcodeNotSet', 'biometryLockout',
  KEK_ERR.NO_HARDWARE_FACTOR, KEK_ERR.NO_SET_FACTOR,
  KEK_ERR.NOT_ENROLLED, KEK_ERR.MALFORMED_VAULT, KEK_ERR.DEGENERATE_INPUT,
]);

const ALL_KEK_CODES = new Set(Object.values(KEK_ERR));

/**
 * Read a stable code off a thrown value. Prefers the `.code` property bag; falls
 * back to an EXACT `.message` match against a known KEK code, because a re-throw
 * across the Capacitor bridge can drop the property bag while preserving the
 * message (hardware.js sets both). Prose is never parsed — that is the whole point
 * of the codes.
 * @param {unknown} err
 * @returns {string|null}
 */
function readCode(err) {
  if (!err || typeof err !== 'object') return null;
  const code = /** @type {{code?: unknown}} */ (err).code;
  if (typeof code === 'string' && code) return code;
  const message = /** @type {{message?: unknown}} */ (err).message;
  if (typeof message === 'string' && ALL_KEK_CODES.has(/** @type {any} */ (message))) return message;
  return null;
}

/**
 * @typedef {object} StepUpFactorOutcome
 * @property {boolean} allowed          always false — this module only ever describes
 *                                      a FAILURE, and STEP_UP_FACTOR carries no
 *                                      success code at all, so an outcome from here
 *                                      can never be mistaken for an allow verdict
 * @property {string}  code             one of STEP_UP_FACTOR
 * @property {boolean} countsAsAttempt  may the caller burn one of its attempt-cap slots?
 * @property {boolean} recoveryRequired retrying can never work; only seed restore can
 * @property {string}  message          plain-language, non-accusatory where warranted
 */

/**
 * Classify why a possession factor failed.
 *
 * Pass the thrown error, or null/undefined when the factor simply resolved a
 * non-true value (an honest no-match with no exception).
 *
 * FAIL CLOSED + FAIL HONEST (I4): an unrecognised error is UNAVAILABLE, never
 * MISMATCH — we do not know what happened, so we do not assert that the user got it
 * wrong. The action stays blocked either way; only the accounting differs, and
 * declining to count an unknown error cannot weaken the guessing rate limit
 * (the OS rate-limits the biometric sheet itself, and in biometric mode there is no
 * knowledge factor being guessed here at all).
 *
 * @param {unknown} err
 * @returns {StepUpFactorOutcome}
 */
export function classifyStepUpFactorFailure(err) {
  const code = readCode(err);

  if (code === KEK_ERR.KEY_PERMANENTLY_INVALIDATED) {
    return {
      allowed: false,
      code: STEP_UP_FACTOR.KEY_INVALIDATED,
      countsAsAttempt: false,
      recoveryRequired: true,
      message: 'This device’s security key was reset by the operating system and can no longer confirm this action. Restore from your seed phrase to continue.',
    };
  }

  if (code && CANCEL_CODES.has(code)) return cancelled();
  if (code && MISMATCH_CODES.has(code)) return mismatch();
  if (code && UNAVAILABLE_CODES.has(code)) return unavailable();

  if (isBiometricGateError(err)) {
    return /** @type {{reason?: string}} */ (err).reason === 'cancelled'
      ? cancelled()
      : unavailable();
  }

  // No error object at all: the factor ran and simply did not verify.
  if (err === null || err === undefined) return mismatch();

  return unavailable();
}

function cancelled() {
  return {
    allowed: false,
    code: STEP_UP_FACTOR.CANCELLED,
    countsAsAttempt: false,
    recoveryRequired: false,
    message: 'Confirmation was cancelled. Nothing was sent — try again when you are ready.',
  };
}

function mismatch() {
  return {
    allowed: false,
    code: STEP_UP_FACTOR.MISMATCH,
    countsAsAttempt: true,
    recoveryRequired: false,
    message: 'That did not match.',
  };
}

function unavailable() {
  return {
    allowed: false,
    code: STEP_UP_FACTOR.UNAVAILABLE,
    countsAsAttempt: false,
    recoveryRequired: false,
    message: 'Your device could not confirm this action right now. Nothing was sent.',
  };
}

/**
 * Run the OS biometric second factor and return a TwoFactorGate verdict.
 *
 * Lives here (not inline in the page) so the send flow and its tests exercise ONE
 * implementation of the decision.
 *
 * `pinOk: true` and `actionPasswordConfigured: true` are carried over verbatim from
 * the original inline leg and are honest for THIS method only: in biometric mode the
 * user is already unlocked (the vault being open proves the PIN), and the second
 * factor is the live biometric — a possession factor, not the Action Password — so
 * "configured" is true by construction, since `resolveSend2faMethod` only returns
 * BIOMETRIC when the biometric factor is set up. Do not copy these literals into the
 * PASSWORD leg, whose `actionPasswordConfigured` must come from the real per-set
 * record (see HiddenWallet2faGate.failClosed.test.jsx for why).
 *
 * Verdict shape:
 *   - allowed:true                       → the caller may proceed
 *   - allowed:false, neutral:true        → BLOCKED, and NOT a wrong attempt
 *   - allowed:false (TWO_FACTOR.WRONG)   → BLOCKED, and a wrong attempt
 *
 * @param {() => Promise<unknown>} runBiometric  the impure OS call (verifyBiometric2fa)
 * @returns {Promise<{allowed: boolean, code?: string, message?: (string|null),
 *                    neutral?: boolean, recoveryRequired?: boolean}>}
 */
export async function evaluateBiometricSecondFactor(runBiometric) {
  let bioOk = false;
  /** @type {unknown} */
  let bioErr = null;
  try {
    // `=== true` is the contract: a truthy non-true value must never authorise.
    bioOk = (await runBiometric()) === true;
  } catch (err) {
    bioOk = false;
    bioErr = err;
  }

  if (!bioOk) {
    const outcome = classifyStepUpFactorFailure(bioErr);
    if (!outcome.countsAsAttempt) {
      return {
        allowed: false,
        neutral: true,
        code: outcome.code,
        message: outcome.message,
        recoveryRequired: outcome.recoveryRequired,
      };
    }
  }

  return evaluateTwoFactor({
    pinOk: true,
    passwordOk: bioOk,
    actionPasswordConfigured: true,
  });
}
