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
import { normalizeDecimalInput } from '../../lib/locale.js';

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

// The strict predicate is a security control (M-3): it stays ASCII-only. Locale
// awareness is added by CANONICALISING the raw input first, then feeding the
// canonical form to the SAME predicate. Everything below pins that pipeline —
// especially that `isFormAmountWellFormed('1,5')` DOES NOT change (the strict
// rule is what backs assertDecimalAmount downstream), only what the SendCrypto
// call site now hands it does.
describe('SendCrypto amount validity — locale-aware pipeline', () => {
  it('isFormAmountWellFormed still rejects "1,5" directly (M-3 stays ASCII-only)', () => {
    // Regression pin: if this ever flips true, the security control has been
    // weakened. The locale support is meant to widen the CALL SITE, not the
    // predicate.
    expect(isFormAmountWellFormed('1,5')).toBe(false);
  });

  it('accepts "1,5" via the de-DE canonical pipeline', () => {
    // The bug this whole change closes. A German user typing "1,5" hits
    // Continue and it works — because the caller normalises first.
    expect(isFormAmountWellFormed(normalizeDecimalInput('1,5', 'de-DE'))).toBe(true);
  });

  it('accepts "1,5" via fr-FR, es-ES, it-IT, pt-PT, nl-NL', () => {
    for (const loc of ['fr-FR', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL']) {
      expect(isFormAmountWellFormed(normalizeDecimalInput('1,5', loc))).toBe(true);
    }
  });

  it('still rejects "1,5" via the en-US canonical pipeline (ambiguity → malformed)', () => {
    // The intended safety: en-US "1,5" is ambiguous (1.5? or 15?). The
    // canonical helper returns it unchanged, so the predicate still says no
    // and the user sees the 'malformed' message rather than a silent 10x send.
    expect(isFormAmountWellFormed(normalizeDecimalInput('1,5', 'en-US'))).toBe(false);
  });

  it('accepts "1.000,50" via de-DE (thousands stripped, comma → dot)', () => {
    expect(isFormAmountWellFormed(normalizeDecimalInput('1.000,50', 'de-DE'))).toBe(true);
  });

  it('accepts "1,000.50" via en-US (thousands stripped)', () => {
    expect(isFormAmountWellFormed(normalizeDecimalInput('1,000.50', 'en-US'))).toBe(true);
  });

  it('still rejects genuinely malformed input in every locale', () => {
    // These are the cases from the strict test above. They stay rejected — the
    // helper passes them through unchanged, and the predicate flags them.
    for (const loc of ['en-US', 'de-DE', 'fr-FR']) {
      expect(isFormAmountWellFormed(normalizeDecimalInput('1e-8', loc))).toBe(false);
      expect(isFormAmountWellFormed(normalizeDecimalInput('1.2.3', loc))).toBe(false);
      expect(isFormAmountWellFormed(normalizeDecimalInput('abc', loc))).toBe(false);
      expect(isFormAmountWellFormed(normalizeDecimalInput('-1', loc))).toBe(false);
      expect(isFormAmountWellFormed(normalizeDecimalInput('', loc))).toBe(false);
    }
  });
});
