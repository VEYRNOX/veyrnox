import { describe, it, expect } from 'vitest';
import { formatUnlockTime } from '../formatUnlockTime.js';

describe('formatUnlockTime', () => {
  it('returns the first-open copy when there is no prior value', () => {
    expect(formatUnlockTime(null)).toBe('First open on this device');
    expect(formatUnlockTime(undefined)).toBe('First open on this device');
  });

  it('formats a mid-year timestamp to a non-empty string containing the year', () => {
    // 2026-06-14T12:00:00Z — safely mid-year so the year is 2026 in every timezone.
    const out = formatUnlockTime(Date.UTC(2026, 5, 14, 12, 0, 0));
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('2026');
  });

  it('treats a non-number as no value (fail safe)', () => {
    expect(formatUnlockTime('1750000000000')).toBe('First open on this device');
  });

  it('treats NaN and non-finite as no value (fail safe)', () => {
    expect(formatUnlockTime(NaN)).toBe('First open on this device');
    expect(formatUnlockTime(Infinity)).toBe('First open on this device');
  });

  it('treats zero and negative timestamps as no value (no 1970/1969 date)', () => {
    expect(formatUnlockTime(0)).toBe('First open on this device');
    expect(formatUnlockTime(-1)).toBe('First open on this device');
  });
});
