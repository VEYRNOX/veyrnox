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
// world (this exceeds your balance), not an artefact of half-typed input, and its
// text does not change as you keep typing, so it announces once.
//
// Pure: no DOM, no wallet, no network.

/**
 * @param {object} state
 * @param {string}  state.amount           raw input value ("" when unset)
 * @param {number}  state.amountNum        parseFloat(amount) — NaN when unparseable
 * @param {boolean} state.amountTouched    has the user left the field at least once
 * @param {boolean} state.showErrors       has the user attempted to submit
 * @param {boolean} state.balanceKnown     is a live balance available to compare against
 * @param {number}  state.effectiveBalance the balance to compare against
 * @returns {'missing'|'not-positive'|'over-balance'|null}
 */
export function sendAmountErrorKind({
  amount, amountNum, amountTouched, showErrors, balanceKnown, effectiveBalance,
}) {
  // MISSING fires only on a submit attempt — an empty amount is the form's
  // starting state, not a mistake. This case was previously unreachable.
  if (showErrors && !amount) return 'missing';

  // NOT-POSITIVE waits for blur or submit: "0" is a legitimate prefix of "0.5",
  // and this message is an assertive live region.
  if ((amountTouched || showErrors) && amount && Number.isFinite(amountNum) && amountNum <= 0) {
    return 'not-positive';
  }

  // OVER-BALANCE is live: a genuine fact about the entered value, not a
  // half-typed-input artefact.
  if (balanceKnown && amount && Number.isFinite(amountNum) && amountNum > 0 && amountNum > effectiveBalance) {
    return 'over-balance';
  }

  return null;
}
