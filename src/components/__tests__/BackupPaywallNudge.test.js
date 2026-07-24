import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { shouldShowBackupNudge } from '@/components/BackupPaywallNudge';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const KEY = 'veyrnox-backup-nudge-dismissed';

describe('shouldShowBackupNudge', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it('returns true for free tier', () => {
    expect(shouldShowBackupNudge('free')).toBe(true);
  });

  it('returns false for subscribers', () => {
    expect(shouldShowBackupNudge('safety_plus')).toBe(false);
  });

  it('returns false after dismissal', () => {
    localStorage.setItem(KEY, '1');
    expect(shouldShowBackupNudge('free')).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(shouldShowBackupNudge('free')).toBe(false);
  });
});
