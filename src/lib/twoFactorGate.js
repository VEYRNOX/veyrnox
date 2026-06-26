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
  // H4 — single generic failure code for any wrong-factor combination. Distinct
  // PIN_WRONG / PASSWORD_WRONG / BOTH_WRONG codes were an oracle: they let an
  // adversary brute-force the PIN and Action Password SEQUENTIALLY (and so cut the
  // effective search space) instead of having to get both right at once. The gate
  // must reveal that it failed, never which factor was wrong.
  CREDENTIALS_WRONG: 'CREDENTIALS_WRONG',
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
 *                                               (default true; pass false to force setup-first)
 * @returns {{ allowed: boolean, code: string, message: (string|null) }}
 */
export function evaluateTwoFactor({
  pinOk = false,
  passwordOk = false,
  actionPasswordConfigured = true,
} = {}) {
  // 0 — there must BE a second factor for this set, or there is nothing to enforce.
  // The caller decides whether NOT_CONFIGURED blocks the action or routes to setup.
  if (!actionPasswordConfigured) {
    return block(
      TWO_FACTOR.NOT_CONFIGURED,
      'Set an Action Password in the Security Center to authorise critical actions.',
    );
  }

  // 1 — H4: any wrong-factor combination returns ONE indistinguishable verdict
  // (same code AND same message) so nothing leaks which factor was correct. The
  // caller learns only that the gate failed.
  if (!pinOk || !passwordOk) {
    return block(TWO_FACTOR.CREDENTIALS_WRONG, 'Incorrect credentials.');
  }

  // 2 — both factors verified AND a second factor is configured.
  return { allowed: true, code: TWO_FACTOR.ALLOW, message: null };
}
