// Unit tests for the PURE PIN-pad reducer (src/lib/pinPadReducer.js).
//
// These cover the input boundaries that were previously trapped inside PinPad's
// un-exported press() closure and so could not be driven without a browser
// (report T-INFRA-3 / A11Y-PIN-1). Pure in, pure out — no DOM, no React.

import { describe, it, expect } from 'vitest';
import { pinPadReduce, keyToPinAction } from '@/lib/pinPadReducer';

describe('pinPadReduce — digit append + 6-digit cap', () => {
  it('appends a digit and reports the change', () => {
    expect(pinPadReduce('12', '3')).toEqual({ value: '123', changed: true, complete: false });
  });

  it('blocks input at the cap (no-op, not a throw)', () => {
    expect(pinPadReduce('123456', '7')).toEqual({ value: '123456', changed: false, complete: false });
  });

  it('honours a custom length', () => {
    expect(pinPadReduce('123', '4', 4)).toEqual({ value: '1234', changed: true, complete: true });
    expect(pinPadReduce('1234', '5', 4)).toEqual({ value: '1234', changed: false, complete: false });
  });
});

describe('pinPadReduce — auto-submit exactly at length', () => {
  it('marks complete only on the digit that fills the pad', () => {
    expect(pinPadReduce('12345', '6').complete).toBe(true);   // 6th digit
    expect(pinPadReduce('1234', '5').complete).toBe(false);   // 5th digit
  });

  it('does not re-complete once full (cap fires first)', () => {
    expect(pinPadReduce('123456', '1').complete).toBe(false);
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

  it('maps Backspace -> back, Escape/Delete -> clear', () => {
    expect(keyToPinAction('Backspace')).toBe('back');
    expect(keyToPinAction('Escape')).toBe('clear');
    expect(keyToPinAction('Delete')).toBe('clear');
  });

  it('returns null for keys the pad does not consume', () => {
    for (const k of ['Tab', 'Enter', 'ArrowLeft', 'a', 'Shift', ' ', 'F5']) {
      expect(keyToPinAction(k)).toBeNull();
    }
  });
});
