// lib/pinPadReducer.js
//
// PURE reducer for the v1 PIN pad (src/components/security/PinPad.jsx).
//
// The pad's input boundaries — numeric-only, the digit cap, and EXPLICIT submit —
// are the same whether a press comes from an on-screen button or a physical key.
// Extracting them here (report T-INFRA-3) makes those boundaries unit-testable
// without a browser, the codebase's pure-helper pattern, and lets the button
// onClick and the container onKeyDown share ONE source of truth so the two entry
// paths can never drift.
//
// FIX A (deniability-critical, KEK spec §7 / §9 line-item 5): there is NO
// length-based auto-submit. `length` is a DISPLAY/BUFFER cap only (how many dots
// show, the max digits buffered) — it does NOT gate completion. Completion fires
// ONLY on an explicit 'submit' action, for ANY typed length. This is what lets a
// legacy 6-digit PIN reach onComplete on the uniform 8-dot pad, and it removes the
// old auto-submit-at-8 oracle that leaked the expected length. The verification
// layer (KDF/GCM decrypt + Option-A decoy fallback) decides what a value resolves
// to; the pad stays length-agnostic and never errors on a short/empty value.
//
// No secrets, no security logic, no I/O: it maps (value, action) -> a plain
// result describing the next controlled value and whether onComplete should fire.
// The component stays the single owner of value (via onChange) and of calling
// onComplete — the reducer only decides, it never reaches outside.

/**
 * @typedef {Object} PinPadResult
 * @property {string}  value     The next controlled value (unchanged if the action is a no-op).
 * @property {boolean} changed   Whether value differs from the input (skip onChange when false).
 * @property {boolean} complete  Whether this action requests completion (fire onComplete). Only 'submit' sets this.
 */

/**
 * Apply one PIN-pad action to the current value.
 *
 * Actions:
 *   - a single digit '0'..'9' — append, respecting the display/buffer cap (`length`).
 *     A digit NEVER completes — completion is explicit only (Fix A).
 *   - 'back'   — delete the last digit.
 *   - 'clear'  — empty the value (Re-enter).
 *   - 'submit' — request completion with the CURRENT value, regardless of its length
 *                (including empty). changed:false (it never mutates the value),
 *                complete:true. The verification layer decides what the value means;
 *                a short/empty value is not a no-op tell and not an error here — it
 *                completes and fails closed through the normal unlock path (I4,
 *                Option-A). Submitting on empty is intentionally NOT gated, so the
 *                submit control carries no digit-count oracle (§9 line-item 5).
 * Any other action (non-numeric key, multi-char, undefined) is an inert no-op:
 * the value is returned unchanged with changed:false — numeric-only by construction.
 *
 * @param {string} value   Current controlled value (digits only).
 * @param {string} action  'back' | 'clear' | 'submit' | a single digit character.
 * @param {number} [length=8]  Display/buffer cap (max digits + dots shown). NOT a submit gate.
 * @returns {PinPadResult}
 */
export function pinPadReduce(value, action, length = 8) {
  const noop = { value, changed: false, complete: false };

  if (action === 'back') {
    if (value.length === 0) return noop;
    return { value: value.slice(0, -1), changed: true, complete: false };
  }

  if (action === 'clear') {
    if (value.length === 0) return noop;
    return { value: '', changed: true, complete: false };
  }

  // Explicit submit: fire completion with whatever has been typed, at any length
  // (including empty). It never changes the value and never errors — the only place
  // completion originates now, so there is no length-derived auto-submit oracle.
  if (action === 'submit') {
    return { value, changed: false, complete: true };
  }

  // Digit path: strictly one ASCII digit, and only while below the buffer cap.
  // A digit NEVER completes — `length` caps how many digits/dots, not when to submit.
  if (typeof action === 'string' && action.length === 1 && action >= '0' && action <= '9') {
    if (value.length >= length) return noop;
    return { value: value + action, changed: true, complete: false };
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
 *   'Enter'               -> 'submit'  (explicit completion — Fix A)
 *   anything else         -> null
 *
 * @param {string} key  KeyboardEvent.key
 * @returns {('back'|'clear'|'submit'|string)|null}
 */
export function keyToPinAction(key) {
  if (key >= '0' && key <= '9' && key.length === 1) return key;
  if (key === 'Backspace') return 'back';
  if (key === 'Escape' || key === 'Delete') return 'clear';
  if (key === 'Enter') return 'submit';
  return null;
}
