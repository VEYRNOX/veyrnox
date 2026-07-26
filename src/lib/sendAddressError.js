// Which recipient-address error (if any) the Send form should surface.
//
// WHY THIS EXISTS. `isValidAddressForCurrency` returns true for an empty address
// by contract — its own doc says "the empty/required-field case is handled by the
// form, not here" (lib/addressValidation.js). The form never held up that end: the
// required copy was rendered from
//
//     {toAddress ? `Invalid ... address format` : "Recipient address is required"}
//
// but the whole message was gated behind `!addressFormatValid`, which an empty
// field can never make false. So the else-branch was unreachable — pressing
// Continue with no recipient set showErrors, blocked the submit, and said nothing
// about why. The two cases have genuinely different triggers, so they get
// genuinely different conditions rather than one flag and a ternary.
//
// Pure: no DOM, no wallet, no network. The caller supplies the already-computed
// `addressFormatValid` so this module never needs to know about chains.

/**
 * @param {object} state
 * @param {string}  state.toAddress          current recipient value ("" when unset)
 * @param {boolean} state.addressFormatValid `isValidAddressForCurrency(...)` result
 *                                           (true for an empty address, by contract)
 * @param {boolean} state.addressTouched     has the user left the field at least once
 * @param {boolean} state.showErrors         has the user attempted to submit
 * @returns {'missing'|'malformed'|null} which error applies, or null for none
 */
export function sendAddressErrorKind({ toAddress, addressFormatValid, addressTouched, showErrors }) {
  // MISSING fires only on a submit attempt. An empty recipient is the form's
  // STARTING state, not a mistake — gating this on `addressTouched` too would
  // scold anyone who tabbed through the field on their way to the amount.
  if (showErrors && !toAddress) return 'missing';

  // MALFORMED fires once the user has finished with the field (blur) or tried to
  // submit — never mid-entry, because the message is an assertive live region and
  // every address is malformed until it is complete (see SendCrypto).
  if ((addressTouched || showErrors) && !addressFormatValid) return 'malformed';

  return null;
}
