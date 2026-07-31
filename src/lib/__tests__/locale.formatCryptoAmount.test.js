// locale.formatCryptoAmount — locale-aware crypto-amount display formatter.
//
// Sibling of formatUsd (Batch A). Handles the "1.23456789 ETH" / "0.001 BTC"
// class of display — non-currency numeric with an optional symbol suffix. Like
// formatUsd it is DISPLAY-ONLY; never fed back to a parser, and the SendCrypto
// signing path still reads canonicalAmount not any formatted string.
//
// The eight or so ad-hoc `${x.toFixed(N)} ETH` sites this closes ignored
// locale entirely — a de-DE user saw "1,234.56789012 ETH" with the wrong
// thousands separator on every balance card and receive-address line.
//
// Structural pins on non-US locales for the same reason as formatUsd: exact
// Intl grouping glyphs (NBSP vs narrow NBSP) shift by ICU version.

import { describe, it, expect } from 'vitest';
import { formatCryptoAmount } from '../locale.js';

describe('formatCryptoAmount — en-US (exact, stable across ICU)', () => {
  it('groups thousands and defaults to up to 8 fractional digits', () => {
    // 8 digits matches BTC's satoshi precision — the widest crypto scale we
    // display. Callers can override for less-precise assets (ETH balances,
    // USD-pegged tokens) via maximumFractionDigits.
    expect(formatCryptoAmount(1234.56789012, 'en-US')).toBe('1,234.56789012');
  });

  it('trims trailing zeros by default (minFractionDigits: 0)', () => {
    // "1.5" not "1.50000000". Balance columns already read as mono-space, so
    // trailing zeros would just add visual noise.
    expect(formatCryptoAmount(1.5, 'en-US')).toBe('1.5');
    expect(formatCryptoAmount(1000, 'en-US')).toBe('1,000');
  });

  it('respects maximumFractionDigits when caller wants a shorter form', () => {
    expect(formatCryptoAmount(0.123456789, 'en-US', { maximumFractionDigits: 4 })).toBe('0.1235');
    expect(formatCryptoAmount(1234.5, 'en-US', { maximumFractionDigits: 2 })).toBe('1,234.5');
  });

  it('appends the symbol with a single space when opts.symbol is set', () => {
    // Callers pass the asset ticker directly (BTC, ETH, SOL, USDC). Rendering
    // the space here rather than at the call site is the point — a caller who
    // template-literals "${amt} ETH" would silently drop locale grouping.
    expect(formatCryptoAmount(1234.5, 'en-US', { symbol: 'ETH' })).toBe('1,234.5 ETH');
    expect(formatCryptoAmount(0.001, 'en-US', { symbol: 'BTC' })).toBe('0.001 BTC');
  });

  it('symbol + fraction limit compose', () => {
    expect(
      formatCryptoAmount(1234.56789012, 'en-US', { maximumFractionDigits: 4, symbol: 'ETH' })
    ).toBe('1,234.5679 ETH');
  });
});

describe('formatCryptoAmount — non-US locales (structural pins)', () => {
  it('groups de-DE thousands with "." and uses "," as the decimal mark', () => {
    // The BUG this closes: de-DE users saw the en-US shape on every balance.
    // "1.234,5" is the correct locale form for what en-US renders as "1,234.5".
    expect(formatCryptoAmount(1234.5, 'de-DE')).toBe('1.234,5');
  });

  it('groups fr-FR thousands with whitespace (NBSP / narrow NBSP)', () => {
    const out = formatCryptoAmount(1234.5, 'fr-FR');
    // Whitespace between "1" and "234", comma as decimal separator.
    expect(out).toMatch(/^1[\s  ]234,5$/);
  });

  it('preserves the symbol suffix across locales unchanged', () => {
    // The ticker (BTC, ETH, SOL) is a proper noun and MUST NOT be localised.
    // Every locale gets "ETH" not "ЕТН" or "エチ".
    expect(formatCryptoAmount(1234.5, 'de-DE', { symbol: 'ETH' })).toBe('1.234,5 ETH');
    expect(formatCryptoAmount(0.001, 'ja-JP', { symbol: 'BTC' })).toBe('0.001 BTC');
  });
});

describe('formatCryptoAmount — malformed / non-finite input', () => {
  // Same policy as formatUsd — throw on non-finite rather than rendering
  // "NaN ETH". Balance display sites already have their own "reading from
  // network…" / "—" placeholders for the pending / errored case; this helper
  // is for FORMATTING a real number, not for signalling absence.
  it('throws on NaN, Infinity, -Infinity', () => {
    expect(() => formatCryptoAmount(NaN, 'en-US')).toThrow();
    expect(() => formatCryptoAmount(Infinity, 'en-US')).toThrow();
    expect(() => formatCryptoAmount(-Infinity, 'en-US')).toThrow();
  });

  it('formats zero as "0", not blank', () => {
    expect(formatCryptoAmount(0, 'en-US')).toBe('0');
    expect(formatCryptoAmount(0, 'en-US', { symbol: 'ETH' })).toBe('0 ETH');
  });

  it('handles very small values without falling back to exponent notation', () => {
    // parseFloat('0.00000001') is 1e-8; a naive .toString() would render
    // "1e-8" and break the caller's alignment. Intl's decimal style guarantees
    // no exponent regardless of magnitude.
    expect(formatCryptoAmount(0.00000001, 'en-US')).toBe('0.00000001');
    expect(formatCryptoAmount(0.00000001, 'en-US', { symbol: 'BTC' })).toBe('0.00000001 BTC');
  });
});

describe('formatCryptoAmount — bogus locale fallback', () => {
  it('does not throw on an unresolvable locale tag', () => {
    // Same rationale as formatUsd: a stale navigator string must not black-
    // hole every balance card. Fall through to Intl's default.
    expect(() => formatCryptoAmount(1234.5, 'zz-ZZ')).not.toThrow();
    const out = formatCryptoAmount(1234.5, 'zz-ZZ');
    expect(out).toContain('1');
    expect(out).toContain('234');
  });
});
