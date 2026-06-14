// lib/pinPadReducer.js
//
// PURE reducer for the v1 6-digit PIN pad (src/components/security/PinPad.jsx).
//
// The pad's input boundaries — numeric-only, the 6-digit cap, and auto-submit
// exactly at length — are the same whether a press comes from an on-screen
// button or a physical key. Extracting them here (report T-INFRA-3) makes those
// boundaries unit-testable without a browser, the codebase's pure-helper pattern,
// and lets the button onClick and the container onKeyDown share ONE source of
// truth so the two entry paths can never drift.
//
// No secrets, no security logic, no I/O: it maps (value, action) -> a plain
// result describing the next controlled value and whether onComplete should fire.
// The component stays the single owner of value (via onChange) and of calling
// onComplete — the reducer only decides, it never reaches outside.

/**
 * @typedef {Object} PinPadResult
 * @property {string}  value     The next controlled value (unchanged if the action is a no-op).
 * @property {boolean} changed   Whether value differs from the input (skip onChange when false).
 * @property {boolean} complete  Whether this action just filled the pad to `length` (fire onComplete).
 */

/**
 * Apply one PIN-pad action to the current value.
 *
 * Actions:
 *   - a single digit '0'..'9' — append, respecting the cap; auto-completes at length.
 *   - 'back'  — delete the last digit.
 *   - 'clear' — empty the value (Re-enter).
 * Any other action (non-numeric key, multi-char, undefined) is an inert no-op:
 * the value is returned unchanged with changed:false — numeric-only by construction.
 *
 * @param {string} value   Current controlled value (digits only).
 * @param {string} action  'back' | 'clear' | a single digit character.
 * @param {number} [length=6]  Target PIN length.
 * @returns {PinPadResult}
 */
export function pinPadReduce(value, action, length = 6) {
  const noop = { value, changed: false, complete: false };

  if (action === 'back') {
    if (value.length === 0) return noop;
    return { value: value.slice(0, -1), changed: true, complete: false };
  }

  if (action === 'clear') {
    if (value.length === 0) return noop;
    return { value: '', changed: true, complete: false };
  }

  // Digit path: strictly one ASCII digit, and only while below the cap.
  if (typeof action === 'string' && action.length === 1 && action >= '0' && action <= '9') {
    if (value.length >= length) return noop;
    const next = value + action;
    return { value: next, changed: true, complete: next.length === length };
  }

  // Non-numeric / unknown action — numeric-only by construction.
  return noop;
}

/**
 * Map a physical KeyboardEvent.key to a PIN-pad action, or null if the key is
 * not one the pad consumes (so the caller can leave the event unhandled).
 *
 *   '0'..'9'              -> that digit
 *   'Backspace'           -> 'back'
 *   'Escape' | 'Delete'   -> 'clear'   (Delete clears, matching the brief)
 *   anything else         -> null
 *
 * @param {string} key  KeyboardEvent.key
 * @returns {('back'|'clear'|string)|null}
 */
export function keyToPinAction(key) {
  if (key >= '0' && key <= '9' && key.length === 1) return key;
  if (key === 'Backspace') return 'back';
  if (key === 'Escape' || key === 'Delete') return 'clear';
  return null;
}
