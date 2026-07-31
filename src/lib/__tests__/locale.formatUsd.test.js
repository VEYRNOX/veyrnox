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

describe('formatUsd — compact notation (chart-axis ticks)', () => {
  // The ad-hoc `$${(v/1000).toFixed(0)}k` template-literal pattern used across
  // Analytics / PortfolioSnapshots / PortfolioRewind is what this closes: an
  // en-US "$1k" for a de-DE user is wrong on two axes (thousands separator
  // AND the "k" abbreviation, which is "Tsd." in de-DE). Intl.NumberFormat's
  // notation:'compact' handles both, per-locale.
  it('renders $1k / $1M / $1B in en-US with the "K/M/B" abbreviations', () => {
    // "K" (capital) is Intl's canonical en-US short abbreviation; the ad-hoc
    // sites all wrote a lowercase "k", so a byte-for-byte match with the old
    // output was never possible. The right pin is CONTAINS-the-abbreviation.
    const out1k = formatUsd(1000, 'en-US', { compact: true });
    expect(out1k).toMatch(/\$1[.,]?\d*K/);

    const out1m = formatUsd(1_000_000, 'en-US', { compact: true });
    expect(out1m).toMatch(/\$1[.,]?\d*M/);

    const out1b = formatUsd(1_000_000_000, 'en-US', { compact: true });
    expect(out1b).toMatch(/\$1[.,]?\d*B/);
  });

  it('is locale-aware — de-DE uses its own abbreviation, not "K"', () => {
    // de-DE renders 1000 as "1000 $" (no compact abbreviation for thousands
    // in short form) or "1 Mio. $" for millions. Different node/ICU versions
    // may or may not compact at 1k; the STRUCTURAL pin is that the output is
    // NOT the en-US "$1K" shape.
    // maxFractionDigits: 1 so 1.5M doesn't round up to "2 Mio. $" and swallow
    // the "1" this pin looks for. The intent is: de-DE renders in its own
    // abbreviation form ("Mio."), not the en-US "M".
    const out1m = formatUsd(1_500_000, 'de-DE', { compact: true, maximumFractionDigits: 1 });
    // Contains a currency symbol / digit content, and does NOT contain the
    // en-US "M" abbreviation adjacent to the digit — de-DE uses "Mio.".
    expect(out1m).toMatch(/\$|€/); // currency mark
    expect(out1m).toContain('1');
    expect(out1m).not.toMatch(/1[.,]?\d*M(?![i])/); // not "1M" (allow "Mio.")
  });

  it('compact still throws on non-finite (same policy as standard mode)', () => {
    expect(() => formatUsd(NaN, 'en-US', { compact: true })).toThrow();
  });

  it('compact still falls back on bogus locale', () => {
    expect(() => formatUsd(1_000_000, 'zz-ZZ', { compact: true })).not.toThrow();
  });

  it('compact composes with maximumFractionDigits for tick precision', () => {
    // "$1.5M" not "$1.500000M". Same knob callers already know from the
    // non-compact form.
    const out = formatUsd(1_500_000, 'en-US', { compact: true, maximumFractionDigits: 1 });
    expect(out).toMatch(/\$1\.5M/);
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
