// locale.parseLocaleNumber — canonicalise a user-typed decimal string AND
// reject anything the strict validator can't accept.
//
// WHY THIS EXISTS (as a distinct export, not just `parseFloat(normalize(...))`).
// A caller who does `parseFloat(normalizeDecimalInput('1,5', 'en-US'))` gets 1
// silently — the canonicaliser returns '1,5' unchanged (safety pin), and
// parseFloat happily truncates at the comma. Every SendCrypto-style page
// paired normalize + isFormAmountWellFormed to avoid that silent-truncation
// trap. The security-limit pages (SecurityCenter, BudgetLimits) also parse
// user-typed numeric input, so they need the same pairing — packaged as one
// helper so a caller can't skip the well-formedness check by accident.

import { describe, it, expect } from 'vitest';
import { parseLocaleNumber } from '../locale.js';

describe('parseLocaleNumber — comma-decimal locales', () => {
  it('parses de-DE "1,5" as 1.5', () => {
    expect(parseLocaleNumber('1,5', 'de-DE')).toBe(1.5);
  });

  it('parses fr-FR / es-ES / it-IT / pt-PT / nl-NL "1,5" as 1.5', () => {
    for (const loc of ['fr-FR', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL']) {
      expect(parseLocaleNumber('1,5', loc)).toBe(1.5);
    }
  });

  it('parses grouped forms — de-DE "1.000,50" → 1000.5', () => {
    expect(parseLocaleNumber('1.000,50', 'de-DE')).toBe(1000.5);
    expect(parseLocaleNumber('1.234.567,89', 'de-DE')).toBe(1234567.89);
  });

  it('parses fr-FR whitespace-grouped forms', () => {
    expect(parseLocaleNumber('1 234,56', 'fr-FR')).toBe(1234.56);
  });

  it('parses plain ASCII decimals in every locale', () => {
    for (const loc of ['en-US', 'de-DE', 'fr-FR', 'ja-JP']) {
      expect(parseLocaleNumber('0.001', loc)).toBe(0.001);
      expect(parseLocaleNumber('123.45', loc)).toBe(123.45);
      expect(parseLocaleNumber('.5', loc)).toBe(0.5);
    }
  });

  it('parses en-US grouped forms — "1,000.50" → 1000.5', () => {
    expect(parseLocaleNumber('1,000.50', 'en-US')).toBe(1000.5);
  });
});

describe('parseLocaleNumber — SAFETY: ambiguous input returns NaN, never a silent truncation', () => {
  // The whole reason this helper exists. `parseFloat('1,5')` is 1; a caller
  // who saved that as a spend limit would silently set $1 instead of $1.5.
  // parseLocaleNumber returns NaN so the caller MUST decide to reject.
  it('returns NaN for en-US "1,5" (ambiguous — could mean 1.5 or 15)', () => {
    expect(parseLocaleNumber('1,5', 'en-US')).toBeNaN();
  });

  it('returns NaN for de-DE "10.00,50" (broken grouping)', () => {
    // "10.00" is not a valid 3-digit grouping — 2 digits after the dot.
    // Rewriting would guess intent; parseLocaleNumber refuses.
    expect(parseLocaleNumber('10.00,50', 'de-DE')).toBeNaN();
  });

  it('returns NaN for scientific notation across locales', () => {
    for (const loc of ['en-US', 'de-DE', 'fr-FR']) {
      expect(parseLocaleNumber('1e-8', loc)).toBeNaN();
      expect(parseLocaleNumber('1E-3', loc)).toBeNaN();
      expect(parseLocaleNumber('1e99', loc)).toBeNaN();
    }
  });

  it('returns NaN for mixed / multiple separators', () => {
    expect(parseLocaleNumber('1.2.3', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('1,2,3', 'de-DE')).toBeNaN();
  });

  it('returns NaN for trailing / leading punctuation', () => {
    expect(parseLocaleNumber('1.', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('1,', 'de-DE')).toBeNaN();
    expect(parseLocaleNumber('.', 'en-US')).toBeNaN();
  });

  it('returns NaN for signed values (spend limits are positive; sign is a typo)', () => {
    expect(parseLocaleNumber('-5', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('+5', 'en-US')).toBeNaN();
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseLocaleNumber('abc', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('1abc', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('$5', 'en-US')).toBeNaN();
  });

  it('returns NaN for empty / whitespace / null / undefined', () => {
    expect(parseLocaleNumber('', 'en-US')).toBeNaN();
    expect(parseLocaleNumber('   ', 'en-US')).toBeNaN();
    expect(parseLocaleNumber(null, 'en-US')).toBeNaN();
    expect(parseLocaleNumber(undefined, 'en-US')).toBeNaN();
  });

  it('accepts "0" and "0.5" (they ARE well-formed; callers gate on > 0 themselves)', () => {
    // parseLocaleNumber is about SHAPE, not about business rules like "must be
    // positive". SecurityCenter's own validator rejects zero — this helper
    // just refuses to lie about what the user typed.
    expect(parseLocaleNumber('0', 'en-US')).toBe(0);
    expect(parseLocaleNumber('0.5', 'en-US')).toBe(0.5);
    expect(parseLocaleNumber('0,5', 'de-DE')).toBe(0.5);
  });
});

describe('parseLocaleNumber — locale fallback', () => {
  it('does not throw on an unresolvable locale tag', () => {
    // Same policy as normalizeDecimalInput / formatUsd: bogus navigator string
    // must not blow up the whole numeric-input UI.
    expect(() => parseLocaleNumber('1.5', 'zz-ZZ')).not.toThrow();
    expect(parseLocaleNumber('1.5', 'zz-ZZ')).toBe(1.5);
  });
});
