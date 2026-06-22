// Unit tests for the PURE PIN-pad reducer (src/lib/pinPadReducer.js).
//
// These cover the input boundaries that were previously trapped inside PinPad's
// un-exported press() closure and so could not be driven without a browser
// (report T-INFRA-3 / A11Y-PIN-1). Pure in, pure out — no DOM, no React.

import { describe, it, expect } from 'vitest';
import { pinPadReduce, keyToPinAction } from '@/lib/pinPadReducer';

describe('pinPadReduce — digit append + 8-digit cap', () => {
  it('appends a digit and reports the change', () => {
    expect(pinPadReduce('12', '3')).toEqual({ value: '123', changed: true, complete: false });
  });

  it('blocks input at the cap (no-op, not a throw)', () => {
    expect(pinPadReduce('12345678', '9')).toEqual({ value: '12345678', changed: false, complete: false });
  });

  it('honours a custom length as a display/buffer cap only (no auto-submit)', () => {
    expect(pinPadReduce('123', '4', 4)).toEqual({ value: '1234', changed: true, complete: false });
    expect(pinPadReduce('1234', '5', 4)).toEqual({ value: '1234', changed: false, complete: false });
  });
});

describe('pinPadReduce — NO length-based auto-submit (Fix A: explicit submit only)', () => {
  // The lockout repro: under the old auto-submit-at-length model a legacy 6-digit
  // user on an 8-dot pad could never fire completion. Digits must NEVER complete.
  it('a digit never fires complete, at any fill level (the lockout class is gone)', () => {
    expect(pinPadReduce('1234567', '8').complete).toBe(false);  // 8th digit, no auto-submit
    expect(pinPadReduce('123456', '7').complete).toBe(false);   // 7th digit
    expect(pinPadReduce('', '1').complete).toBe(false);         // 1st digit
  });

  it('a custom length also never auto-submits on a digit', () => {
    expect(pinPadReduce('123', '4', 4).complete).toBe(false);
  });
});

describe('pinPadReduce — explicit submit fires onComplete for ANY length', () => {
  // THE LOCKOUT REPRO (Fix A red): a 6-digit value on an 8-dot pad (length=8) must
  // be submittable and reach completion — today it never can.
  it('submits a legacy 6-digit value on an 8-dot pad', () => {
    expect(pinPadReduce('123456', 'submit', 8)).toEqual({ value: '123456', changed: false, complete: true });
  });

  it('submits identically for 6, 7 and 8 digit inputs (no length-based gating)', () => {
    expect(pinPadReduce('123456', 'submit', 8).complete).toBe(true);   // 6
    expect(pinPadReduce('1234567', 'submit', 8).complete).toBe(true);  // 7
    expect(pinPadReduce('12345678', 'submit', 8).complete).toBe(true); // 8
  });

  it('submit does not mutate the value (changed:false) — it only signals completion', () => {
    expect(pinPadReduce('123456', 'submit')).toEqual({ value: '123456', changed: false, complete: true });
  });

  it('submit fails closed on an empty value: completes with the empty value (normal unlock path rejects it)', () => {
    // No length oracle: an empty submit is NOT a no-op tell and NOT a special error;
    // it completes with '' and the verification layer (Option-A decoy / strength check)
    // handles it like any other non-resolving value.
    expect(pinPadReduce('', 'submit')).toEqual({ value: '', changed: false, complete: true });
  });

  it('Enter maps to submit', () => {
    expect(keyToPinAction('Enter')).toBe('submit');
  });
});

describe('pinPadReduce — numeric-only', () => {
  it('ignores non-digit characters', () => {
    for (const k of ['a', 'A', ' ', '.', '-', '٥' /* non-ASCII digit */, 'e']) {
      expect(pinPadReduce('1', k)).toEqual({ value: '1', changed: false, complete: false });
    }
  });

  it('ignores multi-character actions (no paste smuggling)', () => {
    expect(pinPadReduce('', '12')).toEqual({ value: '', changed: false, complete: false });
    expect(pinPadReduce('', '123456')).toEqual({ value: '', changed: false, complete: false });
  });

  it('ignores undefined / empty actions', () => {
    expect(pinPadReduce('1', undefined)).toEqual({ value: '1', changed: false, complete: false });
    expect(pinPadReduce('1', '')).toEqual({ value: '1', changed: false, complete: false });
  });
});

describe('pinPadReduce — backspace', () => {
  it('removes the last digit', () => {
    expect(pinPadReduce('123', 'back')).toEqual({ value: '12', changed: true, complete: false });
  });

  it('is a no-op on an empty value', () => {
    expect(pinPadReduce('', 'back')).toEqual({ value: '', changed: false, complete: false });
  });
});

describe('pinPadReduce — clear', () => {
  it('empties a non-empty value', () => {
    expect(pinPadReduce('1234', 'clear')).toEqual({ value: '', changed: true, complete: false });
  });

  it('is a no-op on an empty value', () => {
    expect(pinPadReduce('', 'clear')).toEqual({ value: '', changed: false, complete: false });
  });
});

describe('keyToPinAction — physical key mapping', () => {
  it('maps digit keys to that digit', () => {
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(keyToPinAction(d)).toBe(d);
    }
  });

  it('maps Backspace -> back, Escape/Delete -> clear, Enter -> submit', () => {
    expect(keyToPinAction('Backspace')).toBe('back');
    expect(keyToPinAction('Escape')).toBe('clear');
    expect(keyToPinAction('Delete')).toBe('clear');
    expect(keyToPinAction('Enter')).toBe('submit');
  });

  it('returns null for keys the pad does not consume', () => {
    for (const k of ['Tab', 'ArrowLeft', 'a', 'Shift', ' ', 'F5']) {
      expect(keyToPinAction(k)).toBeNull();
    }
  });
});
