import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/referral', () => ({
  setPendingReferral: vi.fn(),
  getPendingReferral: vi.fn(() => null),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { REFERRAL_CODE_APPLIED: 'referral_code_applied' },
}));

import { captureReferralFromUrl } from '@/lib/referralAttribution';
import { setPendingReferral } from '@/lib/referral';
import { trackEvent } from '@/api/trackEvent';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

describe('captureReferralFromUrl', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('captures a valid VYX code from ?ref param', () => {
    const url = new URL('https://veyrnox.com/?ref=VYX-AB3DEF');
    captureReferralFromUrl(url);
    expect(setPendingReferral).toHaveBeenCalledWith('VYX-AB3DEF');
    expect(trackEvent).toHaveBeenCalledWith('referral_code_applied', {
      code: 'VYX-AB3DEF',
      source: 'deep_link',
    });
  });

  it('ignores invalid codes', () => {
    const url = new URL('https://veyrnox.com/?ref=INVALID');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('does nothing when no ref param present', () => {
    const url = new URL('https://veyrnox.com/');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('does nothing in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const url = new URL('https://veyrnox.com/?ref=VYX-AB3DEF');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
