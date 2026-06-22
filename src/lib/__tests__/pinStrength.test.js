import { describe, it, expect } from 'vitest';
import { checkPinStrength, MIN_PIN_LENGTH } from '../pinStrength.js';

describe('checkPinStrength', () => {
  it('accepts a non-trivial 6-digit PIN', () => {
    expect(checkPinStrength('846213')).toEqual({ ok: true });
    expect(checkPinStrength('907314').ok).toBe(true);
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
  });

  it('rejects an all-same-digit PIN', () => {
    expect(checkPinStrength('000000').ok).toBe(false);
    expect(checkPinStrength('888888').ok).toBe(false);
  });

  it('rejects strictly ascending or descending sequences', () => {
    expect(checkPinStrength('123456').ok).toBe(false);
    expect(checkPinStrength('234567').ok).toBe(false);
    expect(checkPinStrength('654321').ok).toBe(false);
    expect(checkPinStrength('012345').ok).toBe(false);
  });

  it('rejects well-known common PINs', () => {
    expect(checkPinStrength('121212').ok).toBe(false);
    expect(checkPinStrength('123123').ok).toBe(false);
    expect(checkPinStrength('696969').ok).toBe(false);
    expect(checkPinStrength('789456').ok).toBe(false);
    expect(checkPinStrength('314159').ok).toBe(false);
    expect(checkPinStrength('520520').ok).toBe(false);
  });

  it('does not flag a sequence that wraps past 9→0 (not a trivial PIN)', () => {
    expect(checkPinStrength('678901').ok).toBe(true);
  });

  it('returns a human-readable reason on every rejection', () => {
    for (const bad of ['', '1289', '000000', '123456', '121212']) {
      const r = checkPinStrength(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
