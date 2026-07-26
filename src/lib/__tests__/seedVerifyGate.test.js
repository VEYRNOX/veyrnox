import { describe, it, expect, beforeEach } from 'vitest';
import { requiresVerification, VERIFY_THRESHOLD_USD } from '@/lib/seedVerifyGate';
import { markVerified, markDeferred } from '@/lib/seedVerifyState';

// Drive state through the public API rather than hand-writing localStorage
// keys. The previous version wrote the old per-wallet key format directly, so
// after the storage change two of its cases still "passed" — but only because
// the gate read nothing at all and fell through to false.
describe('seedVerifyGate', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when verified', () => {
    markVerified('w1');
    expect(requiresVerification('w1', 1000)).toBe(false);
  });

  it('returns false when deferred but below threshold', () => {
    markDeferred('w1');
    expect(requiresVerification('w1', VERIFY_THRESHOLD_USD - 1)).toBe(false);
  });

  it('returns true when deferred and at/above threshold', () => {
    markDeferred('w1');
    expect(requiresVerification('w1', VERIFY_THRESHOLD_USD)).toBe(true);
  });

  it('returns false when neither deferred nor verified (fresh wallet)', () => {
    expect(requiresVerification('w1', 1000)).toBe(false);
  });

  it('returns false without a wallet id', () => {
    expect(requiresVerification(null, 1000)).toBe(false);
  });

  // FAIL CLOSED (I4). amountUsd is null whenever the USD rate is unavailable.
  // `null >= 50` is false, so the gate used to switch itself off exactly when
  // pricing broke — and an unpriced send is as likely to be large as small.
  it('requires verification when the USD amount is unknown', () => {
    markDeferred('w1');
    expect(requiresVerification('w1', null)).toBe(true);
    expect(requiresVerification('w1', undefined)).toBe(true);
    expect(requiresVerification('w1', NaN)).toBe(true);
  });

  it('does not require verification for an unknown amount on a verified wallet', () => {
    markVerified('w1');
    expect(requiresVerification('w1', null)).toBe(false);
  });
});
