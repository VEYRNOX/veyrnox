// Which amount error (if any) the Send form should surface. Sibling of
// lib/sendAddressError.js, and fixes the SAME class of bug in the amount field.
//
// WHY THIS EXISTS. The copy existed:
//
//     {amount ? "Amount must be greater than zero" : "Amount is required"}
//
// but the whole message was gated behind `amountBadValue`, which required
// `Number.isFinite(parseFloat(amount))`. For an empty field `parseFloat("")` is
// NaN and `Number.isFinite(NaN)` is false, so the gate could never open while
// `amount` was empty — the else-branch was UNREACHABLE. Pressing Continue with no
// amount set showErrors, blocked the submit, and explained nothing.
//
// The second change is the announcement timing. The old gate was
// `(amount || showErrors) && ... amountNum <= 0`, which is true the instant a user
// types "0" — the first character of "0.5". The message is a role="alert"
// ASSERTIVE live region, so it interrupted to say "Amount must be greater than
// zero" about a number the user was still halfway through typing. Now it waits for
// blur or a submit attempt, matching the address field.
//
// `over-balance` is deliberately NOT gated on blur: it is a statement about the
// world (this exceeds your balance), not an artefact of half-typed input.
//
// THE THIRD CASE — 'malformed'. Continue is gated on `isFormAmountWellFormed`, which
// rejects exponent notation, locale commas, multiple dots and trailing dots ("1e-8",
// "1,5", "1.2.3", "1."). This helper used to return null for all of them, because
// parseFloat("1e-8") is finite, positive and within balance — so pressing Continue
// set showErrors, blocked the submit, and explained NOTHING. That is the same silent
// dead-end this module was written to close for the empty field, one input class
// over. The gate's verdict is now passed in as `wellFormed` (the caller hands us the
// SAME call it gates on, so the message and the gate cannot drift apart) and gets its
// own message.
//
// Pure: no DOM, no wallet, no network.

/**
 * @param {object} state
 * @param {string}  state.amount           raw input value ("" when unset)
 * @param {number}  state.amountNum        parseFloat(amount) — NaN when unparseable
 * @param {boolean} state.wellFormed       isFormAmountWellFormed(amount) — the Continue gate's own verdict
 * @param {boolean} state.amountTouched    has the user left the field at least once
 * @param {boolean} state.showErrors       has the user attempted to submit
 * @param {boolean} state.balanceKnown     is a live balance available to compare against
 * @param {number}  state.effectiveBalance the balance to compare against
 * @returns {'missing'|'not-positive'|'malformed'|'over-balance'|null}
 */
export function sendAmountErrorKind({
  amount, amountNum, wellFormed, amountTouched, showErrors, balanceKnown, effectiveBalance,
}) {
  // MISSING fires only on a submit attempt — an empty amount is the form's
  // starting state, not a mistake. This case was previously unreachable.
  if (showErrors && !amount) return 'missing';

  // NOT-POSITIVE waits for blur or submit: "0" is a legitimate prefix of "0.5",
  // and this message is an assertive live region.
  if ((amountTouched || showErrors) && amount && Number.isFinite(amountNum) && amountNum <= 0) {
    return 'not-positive';
  }

  // MALFORMED waits for blur or submit for the same reason as not-positive: "1." is
  // the halfway point of "1.5" and "1e" of nothing at all. Ordered AFTER not-positive
  // because "0" fails BOTH checks (the predicate requires a non-zero digit) and
  // "must be greater than zero" is the more specific thing to say. Ordered BEFORE
  // over-balance because a value we cannot parse cannot be meaningfully compared to a
  // balance — "1e99" is unusable first and over-balance only incidentally.
  if ((amountTouched || showErrors) && amount && !wellFormed) {
    return 'malformed';
  }

  // OVER-BALANCE is live: a genuine fact about the entered value, not a
  // half-typed-input artefact.
  if (balanceKnown && amount && Number.isFinite(amountNum) && amountNum > 0 && amountNum > effectiveBalance) {
    return 'over-balance';
  }

  return null;
}
