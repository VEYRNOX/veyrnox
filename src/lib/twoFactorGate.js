// src/lib/twoFactorGate.js
//
// The pure decision for the PIN + Action Password two-factor gate that guards
// CRITICAL actions (send/sign, reveal seed, credential changes, duress/panic/
// stealth setup, key export). Mirrors lib/sendGate.js: the impure parts (the two
// Argon2id verifications) happen in the caller; THIS function takes their boolean
// results plus whether an Action Password is configured for the ACTIVE set, and
// returns one ordered verdict. Keeping the decision pure means it is exhaustively
// unit-testable and the enforced rule cannot drift from what the UI shows.
//
// HONEST FRAMING (no fake security): this composes TWO knowledge factors entered
// on ONE device (the PIN + a separate Action Password). That is real defense-in-
// depth — a shoulder-surfed PIN alone no longer authorises a critical action — but
// it is NOT hardware-backed/possession-factor 2FA. Both verifiers run at the FULL
// vault Argon2id cost (see credentialVerifier.js), so neither is a weaker link.
//
// DENIABILITY (I3): the Action Password verifier is stored PER SET (inside each
// vault container), so `actionPasswordConfigured` reflects the ACTIVE set only.
// The gate therefore behaves identically for a real, duress, or decoy session that
// each carry their own Action Password — an observer cannot tell them apart.
//
// FAIL CLOSED (I4): any missing/undefined factor result is treated as NOT verified;
// the gate only returns allowed:true when BOTH factors verify AND an Action
// Password is configured for the active set.
//
// TESTNET-tier; UNAUDITED-PROVISIONAL. No I/O, no crypto, no React — pure values.

export const TWO_FACTOR = Object.freeze({
  ALLOW: 'ALLOW',
  // H4: collapsed PIN_WRONG / PASSWORD_WRONG / BOTH_WRONG into a single opaque code so
  // incorrect attempts do not reveal which factor was right — prevents oracle attacks.
  WRONG: 'WRONG',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
});

const block = (code, message) => ({ allowed: false, code, message });

/**
 * Decide whether a critical action may proceed.
 *
 * @param {object}  i
 * @param {boolean} [i.pinOk]                    the entered PIN verified against the active set
 * @param {boolean} [i.passwordOk]               the entered Action Password verified
 * @param {boolean} [i.actionPasswordConfigured] the ACTIVE set has an Action Password set
 *                                               (M-G: default FALSE — fail closed. A caller
 *                                               that omits this is treated as not-configured
 *                                               and gets NOT_CONFIGURED, never a silent proceed)
 * @returns {{ allowed: boolean, code: string, message: (string|null) }}
 */
export function evaluateTwoFactor({
  pinOk = false,
  passwordOk = false,
  actionPasswordConfigured = false,
} = {}) {
  // 0 — there must BE a second factor for this set, or there is nothing to enforce.
  // The caller decides whether NOT_CONFIGURED blocks the action or routes to setup.
  if (!actionPasswordConfigured) {
    return block(
      TWO_FACTOR.NOT_CONFIGURED,
      'Set an Action Password in the Security Center to authorise critical actions.',
    );
  }

  // H4: single opaque WRONG code for all wrong-credential cases — never reveals which
  // factor was correct, so an attacker cannot use the gate as an oracle.
  if (!pinOk || !passwordOk) {
    return block(TWO_FACTOR.WRONG, 'Incorrect PIN or Action Password.');
  }

  // 2 — both factors verified AND a second factor is configured.
  return { allowed: true, code: TWO_FACTOR.ALLOW, message: null };
}
