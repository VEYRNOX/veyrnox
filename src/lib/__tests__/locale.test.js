// locale.js — canonicalise a user-typed decimal amount for the ASCII-strict
// wallet-core parsers.
//
// WHY THIS EXISTS. `isFormAmountWellFormed` and `assertDecimalAmount` (M-3) only
// accept plain ASCII decimals — "1.5", not "1,5". For a de-DE / fr-FR / es-ES
// user who types the natural "1,5", the Continue button used to silently refuse
// and the malformed-message could not distinguish "typed in the wrong locale"
// from "typed nonsense". This helper takes the raw string plus the resolved UI
// locale and returns the canonical ASCII form the validators expect, WITHOUT
// weakening M-3 — bad input round-trips unchanged so the strict predicate still
// rejects it downstream.
//
// The unavoidable ambiguity: en-US "1,5" and de-DE "1,5" look identical but mean
// different things. The rule below sides with SAFETY: strip a thousands
// separator only if it sits at a valid every-3-digit grouping position from the
// integer's right. "1,5" en-US fails that test → kept as-is → the strict
// predicate still flags it, and the user sees the same 'malformed' message.

import { describe, it, expect } from 'vitest';
import { normalizeDecimalInput, resolveLocale } from '../locale.js';

describe('normalizeDecimalInput — comma-decimal locales (the whole reason this exists)', () => {
  it('rewrites de-DE "1,5" to canonical "1.5"', () => {
    // The bug this closes. isFormAmountWellFormed('1,5') is false; canonicalising
    // first turns it into '1.5', which the same predicate accepts.
    expect(normalizeDecimalInput('1,5', 'de-DE')).toBe('1.5');
  });

  it('rewrites fr-FR "1,5" to "1.5"', () => {
    expect(normalizeDecimalInput('1,5', 'fr-FR')).toBe('1.5');
  });

  it('rewrites es-ES / it-IT / pt-PT / nl-NL "1,5" to "1.5"', () => {
    for (const loc of ['es-ES', 'it-IT', 'pt-PT', 'nl-NL']) {
      expect(normalizeDecimalInput('1,5', loc)).toBe('1.5');
    }
  });

  it('strips a de-DE thousands "." when it sits at a valid grouping position', () => {
    // Integer part "1.000" is a valid 3-digit grouping from the right; decimal
    // is comma → strip the dot, replace the comma with a dot.
    expect(normalizeDecimalInput('1.000,50', 'de-DE')).toBe('1000.50');
    expect(normalizeDecimalInput('1.234.567,89', 'de-DE')).toBe('1234567.89');
  });

  it('strips fr-FR narrow no-break space groupings', () => {
    // Intl.NumberFormat('fr-FR') produces NBSP / narrow NBSP as the group char.
    // Accept the regular space too — that's what a keyboard produces.
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56');
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56');
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56');
  });
});

describe('normalizeDecimalInput — SAFETY: ambiguity must not silently rewrite meaning', () => {
  it('keeps en-US "1,5" as "1,5" so the strict predicate still flags it', () => {
    // "1,5" en-US is ambiguous (did they mean 1.5 or 15?). Silently returning
    // "15" would multiply the send by 10 — exactly the class of silent
    // mis-interpretation this pipeline exists to prevent. Kept as-is so
    // isFormAmountWellFormed(canonical) is still false → 'malformed' → the user
    // reads the message and retypes.
    expect(normalizeDecimalInput('1,5', 'en-US')).toBe('1,5');
  });

  it('keeps de-DE "1.5" as "1.5" — single "." with 1 fractional digit isn\'t a valid group', () => {
    // A de-DE user who types the US "1.5" gets the same string back; the
    // downstream predicate reads it as a decimal and accepts it. This means
    // German users can type EITHER "1,5" or "1.5" — but a genuinely ambiguous
    // "1.5" in de-DE (thousands or decimal?) is treated as decimal, which
    // matches how the user probably intended it.
    expect(normalizeDecimalInput('1.5', 'de-DE')).toBe('1.5');
  });

  it('keeps a broken de-DE thousands like "10.00,50" as-is', () => {
    // "10.00" is NOT a valid 3-digit grouping from the right — the dot sits
    // between 2 and 2 digits. Rewriting would guess the user's intent;
    // returning unchanged lets the strict predicate flag it.
    expect(normalizeDecimalInput('10.00,50', 'de-DE')).toBe('10.00,50');
  });

  it('keeps en-US "1,23" as-is (2 digits after "," is not a valid group)', () => {
    expect(normalizeDecimalInput('1,23', 'en-US')).toBe('1,23');
  });
});

describe('normalizeDecimalInput — canonical passthrough', () => {
  it('leaves plain ASCII decimals unchanged in every locale', () => {
    for (const loc of ['en-US', 'de-DE', 'fr-FR', 'ja-JP']) {
      expect(normalizeDecimalInput('1.5', loc)).toBe('1.5');
      expect(normalizeDecimalInput('0.001', loc)).toBe('0.001');
      expect(normalizeDecimalInput('.5', loc)).toBe('.5');
      expect(normalizeDecimalInput('123', loc)).toBe('123');
    }
  });

  it('strips en-US "1,000" thousands grouping', () => {
    expect(normalizeDecimalInput('1,000', 'en-US')).toBe('1000');
    expect(normalizeDecimalInput('1,000,000.50', 'en-US')).toBe('1000000.50');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeDecimalInput('  1.5  ', 'en-US')).toBe('1.5');
    expect(normalizeDecimalInput('  1,5  ', 'de-DE')).toBe('1.5');
  });

  it('returns empty for empty / whitespace-only input', () => {
    // Distinct from returning e.g. "0" — the caller distinguishes "empty" from
    // "0" for the 'missing' vs 'not-positive' message.
    expect(normalizeDecimalInput('', 'en-US')).toBe('');
    expect(normalizeDecimalInput('   ', 'en-US')).toBe('');
    expect(normalizeDecimalInput(null, 'en-US')).toBe('');
    expect(normalizeDecimalInput(undefined, 'en-US')).toBe('');
  });
});

describe('normalizeDecimalInput — malformed input is passed through unchanged', () => {
  // The strict predicate downstream is what decides malformed vs well-formed;
  // this helper must never LAUNDER malformed input into a canonical shape.
  it.each([
    ['1e-8', 'en-US'],
    ['1e-8', 'de-DE'],
    ['1E-3', 'de-DE'],
    ['1.2.3', 'en-US'],
    ['1,2,3', 'de-DE'],
    ['abc', 'de-DE'],
    ['-1', 'de-DE'],
    ['1.', 'en-US'],
  ])('%s (%s) is returned unchanged', (input, locale) => {
    expect(normalizeDecimalInput(input, locale)).toBe(input);
  });
});

describe('resolveLocale', () => {
  it('returns a non-empty BCP-47 string', () => {
    const loc = resolveLocale();
    expect(typeof loc).toBe('string');
    expect(loc.length).toBeGreaterThan(0);
  });

  it('falls back to en-US when nothing else is available', () => {
    // Simulate an environment with no navigator: pass an empty options bag.
    expect(resolveLocale({ navigator: undefined })).toBe('en-US');
    expect(resolveLocale({ navigator: {} })).toBe('en-US');
  });

  it('prefers navigator.language when present', () => {
    expect(resolveLocale({ navigator: { language: 'de-DE' } })).toBe('de-DE');
  });

  it('prefers navigator.languages[0] over navigator.language when both are set', () => {
    // Chrome's canonical order.
    expect(
      resolveLocale({ navigator: { languages: ['fr-FR', 'en-US'], language: 'en-US' } })
    ).toBe('fr-FR');
  });
});
