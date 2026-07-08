// SendCrypto — form-boundary amount validity (M-3).
//
// The UI "Continue" gate must reject scientific notation ("1e-8") and other
// malformed amounts BEFORE proceeding to the signing mutation. Previously the
// check was only `parseFloat(amount) <= 0`, which accepts "1e-8" (parseFloat
// reads it as a valid positive float ~1e-8) — letting a scientific-notation
// string cross the form boundary into the send path, where downstream parsers
// behave inconsistently. This pins the pure predicate that now backs the gate.

import { describe, it, expect } from 'vitest';
import { isFormAmountWellFormed } from '../SendCrypto.jsx';

describe('SendCrypto amount validity (M-3)', () => {
  it('rejects scientific notation "1e-8"', () => {
    expect(isFormAmountWellFormed('1e-8')).toBe(false);
  });

  it('rejects other malformed / non-positive amounts', () => {
    expect(isFormAmountWellFormed('1e18')).toBe(false);
    expect(isFormAmountWellFormed('1E-3')).toBe(false);
    expect(isFormAmountWellFormed('-1')).toBe(false);
    expect(isFormAmountWellFormed('1,5')).toBe(false);
    expect(isFormAmountWellFormed('1.2.3')).toBe(false);
    expect(isFormAmountWellFormed('0')).toBe(false);
    expect(isFormAmountWellFormed('')).toBe(false);
    expect(isFormAmountWellFormed('abc')).toBe(false);
    expect(isFormAmountWellFormed('1.')).toBe(false);
  });

  it('accepts well-formed positive decimal amounts', () => {
    expect(isFormAmountWellFormed('1')).toBe(true);
    expect(isFormAmountWellFormed('0.001')).toBe(true);
    expect(isFormAmountWellFormed('.5')).toBe(true);
    expect(isFormAmountWellFormed('123.45')).toBe(true);
  });
});
