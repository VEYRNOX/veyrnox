// lib/locale.js — resolver + I3 write-chokepoint + decimal-input normalization.
//
// Two intents covered in one file (matches lib/locale.js's two responsibilities):
//   - preferences (locale/timezone/fiat) with reads ungated, writes NO-OP in a
//     decoy/demo session — same shape as lib/consent.js after PR #1410.
//   - decimal canonicalisation for the send-amount path. The strict downstream
//     predicate (assertDecimalAmount, M-3) is unchanged; this file's rule is
//     "canonicalise unambiguously, otherwise round-trip unchanged".
//
// The two suites overlap only at the surface (`normalizeDecimalInput`); each
// asserts a distinct aspect so removing either loses coverage.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOCALE_KEY, TIMEZONE_KEY, FIAT_KEY, LOCALE_CHANGED_EVENT, SUPPORTED_FIAT,
  resolveLocale, resolveTimeZone, resolveFiatCurrency,
  setLocale, setTimeZone, setFiatCurrency, clearLocalePreferences,
  normalizeDecimalInput,
} from '../locale.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

function clearAllPrefs() {
  try {
    localStorage.removeItem(LOCALE_KEY);
    localStorage.removeItem(TIMEZONE_KEY);
    localStorage.removeItem(FIAT_KEY);
    localStorage.removeItem('veyrnox-demo');
  } catch {}
  setDeniabilitySession(false);
}

describe('resolveLocale / resolveTimeZone / resolveFiatCurrency', () => {
  beforeEach(clearAllPrefs);
  afterEach(clearAllPrefs);

  it('falls back to a safe default when nothing is stored', () => {
    expect(typeof resolveLocale()).toBe('string');
    expect(resolveLocale().length).toBeGreaterThan(0);
    expect(typeof resolveTimeZone()).toBe('string');
    expect(resolveFiatCurrency()).toBe('USD');
  });

  it('honours a stored preference over the browser default', () => {
    localStorage.setItem(LOCALE_KEY, 'de-DE');
    localStorage.setItem(TIMEZONE_KEY, 'Europe/Berlin');
    localStorage.setItem(FIAT_KEY, 'EUR');
    expect(resolveLocale()).toBe('de-DE');
    expect(resolveTimeZone()).toBe('Europe/Berlin');
    expect(resolveFiatCurrency()).toBe('EUR');
  });

  it('rejects a stored fiat code outside SUPPORTED_FIAT (fail-closed)', () => {
    localStorage.setItem(FIAT_KEY, 'ZWL');
    expect(resolveFiatCurrency()).toBe('USD');
  });

  it('accepts a synthetic navigator via opts (API preserved from PR #1471)', () => {
    // Empty bag / empty navigator → fallback
    expect(resolveLocale({ navigator: undefined })).toBe('en-US');
    expect(resolveLocale({ navigator: {} })).toBe('en-US');
    // Explicit language field
    expect(resolveLocale({ navigator: { language: 'de-DE' } })).toBe('de-DE');
    // Chrome's canonical order: navigator.languages[0] wins over navigator.language
    expect(
      resolveLocale({ navigator: { languages: ['fr-FR', 'en-US'], language: 'en-US' } })
    ).toBe('fr-FR');
  });
});

describe('setLocale / setTimeZone / setFiatCurrency', () => {
  beforeEach(clearAllPrefs);
  afterEach(clearAllPrefs);

  it('persists a valid preference and dispatches LOCALE_CHANGED_EVENT', () => {
    const handler = vi.fn();
    window.addEventListener(LOCALE_CHANGED_EVENT, handler);
    setLocale('fr-FR');
    setTimeZone('Europe/Paris');
    setFiatCurrency('EUR');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('fr-FR');
    expect(localStorage.getItem(TIMEZONE_KEY)).toBe('Europe/Paris');
    expect(localStorage.getItem(FIAT_KEY)).toBe('EUR');
    expect(handler).toHaveBeenCalledTimes(3);
    window.removeEventListener(LOCALE_CHANGED_EVENT, handler);
  });

  it('silently ignores an unsupported fiat code', () => {
    setFiatCurrency('ZWL');
    expect(localStorage.getItem(FIAT_KEY)).toBeNull();
    for (const c of SUPPORTED_FIAT) {
      setFiatCurrency(c);
      expect(localStorage.getItem(FIAT_KEY)).toBe(c);
    }
  });

  it('is a NO-OP in a decoy/demo session (I3) — write is dropped, event NOT fired', () => {
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(FIAT_KEY, 'USD');
    const handler = vi.fn();
    window.addEventListener(LOCALE_CHANGED_EVENT, handler);

    setDeniabilitySession(true);
    setLocale('fr-FR');
    setTimeZone('Europe/Paris');
    setFiatCurrency('EUR');
    clearLocalePreferences();

    // Real user's stored preference is untouched.
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en-US');
    expect(localStorage.getItem(FIAT_KEY)).toBe('USD');
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(LOCALE_CHANGED_EVENT, handler);
  });

  it('demo session (veyrnox-demo=1) is also gated', () => {
    localStorage.setItem('veyrnox-demo', '1');
    setLocale('fr-FR');
    setFiatCurrency('EUR');
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();
    expect(localStorage.getItem(FIAT_KEY)).toBeNull();
  });
});

// ── The decimal-normalization suite ships as its own describe blocks so a
// failure names the case precisely. Merged from PR #1471 (send-amount fix)
// and preserved verbatim except for the top-level import statement above.

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
    // Accept the regular space too — that's what a keyboard produces. Kept as
    // \u escapes to survive round-trips through tools that flatten NBSPs.
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56'); // U+0020
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56'); // NBSP
    expect(normalizeDecimalInput('1 234,56', 'fr-FR')).toBe('1234.56'); // narrow NBSP
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
