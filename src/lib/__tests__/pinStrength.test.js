import { describe, it, expect } from 'vitest';
import { checkPinStrength, MIN_PIN_LENGTH } from '../pinStrength.js';

describe('checkPinStrength', () => {
  it('accepts a non-trivial 8-digit PIN', () => {
    expect(checkPinStrength('84621379')).toEqual({ ok: true });
    expect(checkPinStrength('90731452').ok).toBe(true);
  });

  it('rejects non-numeric or empty input', () => {
    expect(checkPinStrength('12a456').ok).toBe(false);
    expect(checkPinStrength('').ok).toBe(false);
    expect(checkPinStrength(null).ok).toBe(false);
    expect(checkPinStrength(undefined).ok).toBe(false);
  });

  it(`rejects PINs shorter than ${MIN_PIN_LENGTH} digits`, () => {
    expect(checkPinStrength('1289').ok).toBe(false);
    expect(checkPinStrength('12893').ok).toBe(false);
    expect(checkPinStrength('128937').ok).toBe(false);
    expect(checkPinStrength('1289371').ok).toBe(false);
  });

  it('rejects an all-same-digit PIN', () => {
    expect(checkPinStrength('00000000').ok).toBe(false);
    expect(checkPinStrength('88888888').ok).toBe(false);
  });

  it('rejects strictly ascending or descending sequences', () => {
    expect(checkPinStrength('12345678').ok).toBe(false);
    expect(checkPinStrength('23456789').ok).toBe(false);
    expect(checkPinStrength('87654321').ok).toBe(false);
    expect(checkPinStrength('01234567').ok).toBe(false);
  });

  it('rejects well-known common PINs', () => {
    expect(checkPinStrength('12121212').ok).toBe(false);
    expect(checkPinStrength('12341234').ok).toBe(false);
    expect(checkPinStrength('69696969').ok).toBe(false);
    expect(checkPinStrength('13572468').ok).toBe(false);
    expect(checkPinStrength('31415926').ok).toBe(false);
    expect(checkPinStrength('11223344').ok).toBe(false);
  });

  it('does not flag a sequence that wraps past 9→0 (not a trivial PIN)', () => {
    expect(checkPinStrength('67890123').ok).toBe(true);
  });

  it('returns a human-readable reason on every rejection', () => {
    for (const bad of ['', '1289', '00000000', '12345678', '12121212']) {
      const r = checkPinStrength(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
