import { describe, it, expect, beforeEach } from 'vitest';
import { requiresVerification, VERIFY_THRESHOLD_USD } from '@/lib/seedVerifyGate';

describe('seedVerifyGate', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when verified', () => {
    localStorage.setItem('veyrnox-seed-verify-verified-w1', '1');
    expect(requiresVerification('w1', 1000)).toBe(false);
  });

  it('returns false when deferred but below threshold', () => {
    localStorage.setItem('veyrnox-seed-verify-deferred-w1', '1');
    expect(requiresVerification('w1', VERIFY_THRESHOLD_USD - 1)).toBe(false);
  });

  it('returns true when deferred and at/above threshold', () => {
    localStorage.setItem('veyrnox-seed-verify-deferred-w1', '1');
    expect(requiresVerification('w1', VERIFY_THRESHOLD_USD)).toBe(true);
  });

  it('returns false when neither deferred nor verified (fresh wallet)', () => {
    expect(requiresVerification('w1', 1000)).toBe(false);
  });
});
