// locale.formatUsd — locale-aware USD formatter for DISPLAY.
//
// Sibling of normalizeDecimalInput, but for the opposite direction — this reads
// a number and produces the string a user sees. Never fed back into a parser;
// SendCrypto's signing path uses canonicalAmount, not any formatted output.
//
// This suite pins the CONTRACT, not exact glyphs: Intl output for a given
// locale can shift by ICU version (e.g. `$` vs `US$`, NBSP vs narrow NBSP,
// symbol before vs after the number). Pinning exact strings for anything other
// than en-US would make the suite red on a routine Node upgrade — so
// non-en-US locales assert STRUCTURE (digits present, grouped per locale,
// currency-marked) rather than a byte-for-byte match.

import { describe, it, expect } from 'vitest';
import { formatUsd } from '../locale.js';

describe('formatUsd — en-US (exact, stable across ICU)', () => {
  it('formats a whole number with grouping and $ prefix', () => {
    expect(formatUsd(1650, 'en-US')).toBe('$1,650');
  });

  it('rounds to whole dollars by default (maximumFractionDigits: 0)', () => {
    expect(formatUsd(1650.4, 'en-US')).toBe('$1,650');
    expect(formatUsd(1650.6, 'en-US')).toBe('$1,651');
  });

  it('adds thousands separators for large values', () => {
    expect(formatUsd(1234567, 'en-US')).toBe('$1,234,567');
  });

  it('accepts a maximumFractionDigits opt for precise display', () => {
    // The reference-rate call site rounds to whole; a "USD spent today"
    // banner may want cents. Same helper, one opt.
    expect(formatUsd(12.345, 'en-US', { maximumFractionDigits: 2 })).toBe('$12.35');
  });
});

describe('formatUsd — non-US locales (structural pins)', () => {
  it('groups thousands with the locale\'s own separator, not a comma', () => {
    // de-DE groups with "." not ",". Assert the digits appear grouped
    // correctly, without pinning the exact separator glyph or the currency
    // symbol position (both vary by ICU version).
    const out = formatUsd(1234567, 'de-DE');
    // Extract just the digit run + its grouping separator. The exact currency
    // decoration is what varies; the number itself is stable.
    const digits = out.replace(/[^\d.,   ]/g, '').trim();
    // de-DE: "1.234.567" — dots as thousands.
    expect(digits).toMatch(/^1\.234\.567$/);
  });

  it('groups fr-FR with a non-breaking space, not a comma or dot', () => {
    const out = formatUsd(1234567, 'fr-FR');
    const digits = out.replace(/[^\d.,   ]/g, '').trim();
    // fr-FR uses NBSP / narrow NBSP as thousands grouping. Match any of them.
    expect(digits).toMatch(/^1[\s  ]234[\s  ]567$/);
  });

  it('marks the value as US dollars — currency identifier present', () => {
    // Different ICU versions render US dollars as "$", "US$", or "$US". All
    // of them contain either "$" or "US"; that's the guarantee this suite
    // pins so a locale-agnostic caller knows a currency was actually rendered
    // (not just a bare number).
    const out = formatUsd(50, 'ja-JP');
    expect(out).toMatch(/\$|US/);
  });
});

describe('formatUsd — malformed / non-finite input', () => {
  // The helper does NOT swallow bad input on its own — a caller who wants a
  // "≈$0" fallback (approxUsd, historically) applies the fallback BEFORE
  // calling this. Rationale: a caller displaying a real "USD spent today: $0"
  // wants to see zero, while one displaying an unknown rate wants to see
  // "unknown" (which is neither zero nor a formatted string). Keep this
  // formatter's job narrow — just format a finite number.
  it('formats 0 as $0, not blank', () => {
    expect(formatUsd(0, 'en-US')).toBe('$0');
  });

  it('formats a negative value with the locale\'s own minus sign', () => {
    // Some locales use a leading "-", some parenthesize; pin only that some
    // negative marker appears and the digits are correct.
    const out = formatUsd(-42, 'en-US');
    expect(out).toContain('42');
    expect(out).toMatch(/-|\(/);
  });

  it('throws on non-finite input rather than silently formatting NaN', () => {
    // Intl.NumberFormat renders NaN as "NaN" or "非數值" — neither is what a
    // caller wants to show. Making this a throw forces the caller to decide
    // what "no rate available" means at THEIR site (blank? em-dash?
    // "≈$0"?) — no formatter can guess.
    expect(() => formatUsd(NaN, 'en-US')).toThrow();
    expect(() => formatUsd(Infinity, 'en-US')).toThrow();
    expect(() => formatUsd(-Infinity, 'en-US')).toThrow();
  });
});

describe('formatUsd — locale fallback', () => {
  it('falls back gracefully when Intl rejects the locale tag', () => {
    // "zz-ZZ" is not a real BCP-47 tag; Intl.NumberFormat is permissive and
    // resolves to a default. The helper must not throw for a bogus tag from a
    // stale navigator string — that would break the whole USD column of the
    // UI for the entire session.
    expect(() => formatUsd(1650, 'zz-ZZ')).not.toThrow();
    const out = formatUsd(1650, 'zz-ZZ');
    expect(out).toContain('1');
    expect(out).toContain('650');
  });
});
