import { describe, it, expect, vi, beforeEach } from 'vitest';

const DISMISSED_KEY = 'veyrnox-referral-prompt-dismissed';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/referral', () => ({
  getLocalState: vi.fn(() => ({ code: 'VYX-TEST01' })),
  getEphemeralCode: vi.fn(() => 'VYX-EPHEM1'),
}));

import { shouldShowReferralPrompt } from '@/components/ReferralPrompt';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

describe('shouldShowReferralPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns true on first send', () => {
    expect(shouldShowReferralPrompt()).toBe(true);
  });

  it('returns false after dismissal', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    expect(shouldShowReferralPrompt()).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(shouldShowReferralPrompt()).toBe(false);
  });
});
