// lib/__tests__/cryptos.test.js
//
// Unit tests for approxUsd — the display formatter for any USD figure DERIVED
// from the static USD_RATES table. It marks the number approximate (≈) and
// rounds to whole dollars, so a reference-rate value is never shown as exact.
//
// The locale is passed EXPLICITLY here rather than relying on the test
// environment's navigator. That makes the suite deterministic across CI, and
// lets a single test file cover the en-US baseline AND non-US locales — which
// matters because approxUsd used to hardcode `toLocaleString('en-US')` and
// showed "$1,650" to every user regardless of locale.

import { describe, it, expect } from 'vitest';
import { approxUsd } from '@/lib/cryptos';

describe('approxUsd — en-US (exact, stable across ICU)', () => {
  it('prefixes with ≈ and rounds to whole dollars', () => {
    expect(approxUsd(1650.4, 'en-US')).toBe('≈$1,650');
  });

  it('rounds at the half dollar', () => {
    expect(approxUsd(0.6, 'en-US')).toBe('≈$1');
  });

  it('adds thousands separators', () => {
    expect(approxUsd(1234567, 'en-US')).toBe('≈$1,234,567');
  });

  it('renders sub-dollar and zero values as ≈$0', () => {
    expect(approxUsd(0.004, 'en-US')).toBe('≈$0');
    expect(approxUsd(0, 'en-US')).toBe('≈$0');
  });

  it('guards non-finite and negative input as ≈$0', () => {
    // The regression this pins: formatUsd throws on NaN, so approxUsd MUST
    // coerce non-finite / non-positive to 0 BEFORE delegating — otherwise
    // every "USD spent today" cell for a user with no history would throw and
    // blank the column. The guard lives in approxUsd, not formatUsd.
    expect(approxUsd(NaN, 'en-US')).toBe('≈$0');
    expect(approxUsd(Infinity, 'en-US')).toBe('≈$0');
    expect(approxUsd(-Infinity, 'en-US')).toBe('≈$0');
    expect(approxUsd(-5, 'en-US')).toBe('≈$0');
  });
});

describe('approxUsd — non-US locales (structural pins)', () => {
  // The bug this closes: 'en-US' was hardcoded, so a de-DE user typing a
  // spend limit saw "$5,000" instead of "5.000 $". The ≈ prefix is
  // language-neutral (it means "approximate"); everything after is locale-
  // native, delegated to formatUsd. These assertions pin the STRUCTURE, not
  // exact glyphs, because Intl currency decoration varies by ICU version.
  it('groups thousands the de-DE way, not the en-US way', () => {
    const out = approxUsd(1234567, 'de-DE');
    expect(out.startsWith('≈')).toBe(true);
    // de-DE uses "." as thousands separator, NOT ",".
    expect(out).toContain('1.234.567');
    expect(out).not.toContain('1,234,567');
  });

  it('groups thousands the fr-FR way (NBSP / narrow NBSP)', () => {
    const out = approxUsd(1234567, 'fr-FR');
    expect(out.startsWith('≈')).toBe(true);
    // fr-FR groups with whitespace, not "." or ",".
    expect(out).toMatch(/1[\s  ]234[\s  ]567/);
  });

  it('zero renders locale-natively too, still ≈-prefixed', () => {
    // Regression pin: the fallback path (Math.round → 0) still routes through
    // formatUsd, so "no rate" shows the locale's zero form — not a hardcoded
    // "$0" that would look out of place next to a de-DE "1.650 $".
    const out = approxUsd(0, 'de-DE');
    expect(out.startsWith('≈')).toBe(true);
    expect(out).toContain('0');
  });
});

describe('approxUsd — navigator-driven default (contract, not glyphs)', () => {
  it('is callable without an explicit locale — pulls from resolveLocale()', () => {
    // Without arg, approxUsd defaults to resolveLocale() which reads
    // navigator. This pins the contract (no-throw, ≈-prefixed, contains the
    // dollar figure) without pinning the exact glyphs — those depend on the
    // test env's navigator, which is out of our control.
    const out = approxUsd(1650);
    expect(out.startsWith('≈')).toBe(true);
    expect(out).toContain('1');
    expect(out).toContain('650');
  });
});
