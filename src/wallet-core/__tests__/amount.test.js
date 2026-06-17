// wallet-core/__tests__/amount.test.js
//
// The one canonical decimal-amount validator, shared by every send family
// (EVM native/ERC-20 + BTC/SOL via toBaseUnits). Locks the rule so the EVM path
// can never silently diverge from the BTC/SOL validation again.

import { describe, it, expect } from 'vitest';
import { assertDecimalAmount } from '../amount.js';

describe('assertDecimalAmount', () => {
  it('accepts well-formed positive decimals', () => {
    expect(assertDecimalAmount('1', 18)).toBe('1');
    expect(assertDecimalAmount('0.0123', 18)).toBe('0.0123');
    expect(assertDecimalAmount('.5', 9)).toBe('.5');
    expect(assertDecimalAmount('007', 6)).toBe('007');
    expect(assertDecimalAmount('  1.5  ', 6)).toBe('1.5'); // trims
  });

  it('rejects non-positive amounts with a "positive" error', () => {
    expect(() => assertDecimalAmount('0', 18)).toThrow(/positive/i);
    expect(() => assertDecimalAmount('0.00', 6)).toThrow(/positive/i);
  });

  it('rejects malformed input (signs, sci-notation, locale, multiple dots, letters)', () => {
    for (const bad of ['', '-1', '+1', '1e-3', '1E3', '1,5', '1.2.3', '1.', 'abc', '0x1']) {
      expect(() => assertDecimalAmount(bad, 18)).toThrow(/invalid amount/i);
    }
  });

  it('rejects over-precision for the asset decimals', () => {
    expect(() => assertDecimalAmount('0.0000001', 6)).toThrow(/more than 6 decimal places/i); // 7dp into 6
    expect(() => assertDecimalAmount('0.000000001', 8)).toThrow(/more than 8 decimal places/i); // 9dp into 8 (BTC)
    expect(assertDecimalAmount('0.000001', 6)).toBe('0.000001'); // exactly at the limit is ok
  });
});
