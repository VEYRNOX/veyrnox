import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/referral', () => ({
  setPendingReferral: vi.fn(),
  getPendingReferral: vi.fn(() => null),
  hasRedeemed: vi.fn(() => false),
}));
let platform = 'android';
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => platform } }));
vi.mock('@/plugins/installReferrer', () => ({ getInstallReferrer: vi.fn() }));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { REFERRAL_CODE_APPLIED: 'referral_code_applied' },
}));

import { captureReferralFromUrl, captureReferralCode, referralCodeFromUrl, captureInstallReferrer, playStoreReferralUrl } from '@/lib/referralAttribution';
import { setPendingReferral, getPendingReferral, hasRedeemed } from '@/lib/referral';
import { getInstallReferrer } from '@/plugins/installReferrer';
import { trackEvent } from '@/api/trackEvent';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

describe('captureReferralFromUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    vi.mocked(getPendingReferral).mockReturnValue(null);
  });

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

  // Native universal/app link (#2527): the share link itself, /r/<code>,
  // arrives in the installed app without ever passing through the redirect.
  it('captures the code from a /r/<code> universal link with the given source', () => {
    captureReferralFromUrl(new URL('https://veyrnox.com/r/VYX-STRKLB'), 'universal_link');
    expect(setPendingReferral).toHaveBeenCalledWith('VYX-STRKLB');
    expect(trackEvent).toHaveBeenCalledWith('referral_code_applied', {
      code: 'VYX-STRKLB',
      source: 'universal_link',
    });
  });

  it('does not re-store a code that is already pending', () => {
    vi.mocked(getPendingReferral).mockReturnValue('VYX-STRKLB');
    captureReferralFromUrl(new URL('https://veyrnox.com/r/VYX-STRKLB'), 'universal_link');
    expect(setPendingReferral).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('gates the /r/ shape on deniability too (I3)', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    captureReferralFromUrl(new URL('https://veyrnox.com/r/VYX-STRKLB'), 'universal_link');
    expect(setPendingReferral).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe('referralCodeFromUrl', () => {
  it.each([
    ['?ref= query', 'https://veyrnox.com/?ref=VYX-AB3DEF', 'VYX-AB3DEF'],
    ['/r/ path', 'https://veyrnox.com/r/VYX-STRKLB', 'VYX-STRKLB'],
    ['/r/ path, trailing slash', 'https://veyrnox.com/r/VYX-STRKLB/', 'VYX-STRKLB'],
    ['/r/ path, lower case', 'https://veyrnox.com/r/vyx-strklb', 'VYX-STRKLB'],
    ['/r/ path, percent-encoded', 'https://veyrnox.com/r/VYX%2DSTRKLB', 'VYX-STRKLB'],
    ['?ref= wins over the path', 'https://veyrnox.com/r/VYX-STRKLB?ref=VYX-AB3DEF', 'VYX-AB3DEF'],
  ])('reads %s', (_label, href, expected) => {
    expect(referralCodeFromUrl(new URL(href))).toBe(expected);
  });

  it.each([
    ['a malformed path code', 'https://veyrnox.com/r/VYX-STRIKE'], // I not in alphabet
    ['a nested path', 'https://veyrnox.com/r/VYX-STRKLB/extra'],
    ['an empty /r/', 'https://veyrnox.com/r/'],
    // #2534: same rule as Pages routing and the veyrnox.com Worker.
    ['a doubled leading slash', 'https://veyrnox.com/r//VYX-STRKLB'],
    ['a doubled trailing slash', 'https://veyrnox.com/r/VYX-STRKLB//'],
    ['a bad %-escape', 'https://veyrnox.com/r/VYX-%E0%A4%A'],
    ['an unrelated path', 'https://veyrnox.com/wc?uri=wc%3Aabc'],
    ['a malformed ?ref= even with a good path', 'https://veyrnox.com/r/VYX-STRKLB?ref=nope'],
  ])('returns null for %s', (_label, href) => {
    expect(referralCodeFromUrl(new URL(href))).toBeNull();
  });
});

// #2541: a share link tapped without the app installed reaches the app only as
// Play's install referrer.
describe('playStoreReferralUrl', () => {
  it('encodes the whole referrer value, which Play requires', () => {
    const u = new URL(playStoreReferralUrl('VYX-AB3DEF'));
    expect(u.origin + u.pathname).toBe('https://play.google.com/store/apps/details');
    expect(u.searchParams.get('id')).toBe('com.veyrnox.app');
    // One level of decoding yields exactly what Play hands back to the app.
    expect(u.searchParams.get('referrer')).toBe('ref=VYX-AB3DEF');
    expect(playStoreReferralUrl('VYX-AB3DEF')).toContain('referrer=ref%3DVYX-AB3DEF');
  });
});

describe('captureInstallReferrer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform = 'android';
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    vi.mocked(getPendingReferral).mockReturnValue(null);
    vi.mocked(hasRedeemed).mockReturnValue(false);
    vi.mocked(getInstallReferrer).mockResolvedValue('ref=VYX-AB3DEF');
  });

  it('stores the code a Play install carried, tagged install_referrer', async () => {
    await captureInstallReferrer();
    expect(setPendingReferral).toHaveBeenCalledWith('VYX-AB3DEF');
    expect(trackEvent).toHaveBeenCalledWith('referral_code_applied', { code: 'VYX-AB3DEF', source: 'install_referrer' });
  });

  it('ignores an organic install referrer', async () => {
    vi.mocked(getInstallReferrer).mockResolvedValue('utm_source=google-play&utm_medium=organic');
    await captureInstallReferrer();
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('ignores a malformed code in the referrer', async () => {
    vi.mocked(getInstallReferrer).mockResolvedValue('ref=NOT-A-CODE');
    await captureInstallReferrer();
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('treats a plugin rejection as no referrer (never throws)', async () => {
    vi.mocked(getInstallReferrer).mockRejectedValue(new Error('not available'));
    await expect(captureInstallReferrer()).resolves.toBeUndefined();
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('does not ask for the referrer off Android', async () => {
    platform = 'ios';
    await captureInstallReferrer();
    expect(getInstallReferrer).not.toHaveBeenCalled();
  });

  it('I3: does not read the referrer or write in a deniability/demo session', async () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    await captureInstallReferrer();
    expect(getInstallReferrer).not.toHaveBeenCalled();
    expect(hasRedeemed).not.toHaveBeenCalled();
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('I3: a session switch during the referrer lookup still blocks the write', async () => {
    vi.mocked(getInstallReferrer).mockImplementation(async () => {
      vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
      return 'ref=VYX-AB3DEF';
    });
    await captureInstallReferrer();
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('skips once a code is pending or already redeemed', async () => {
    vi.mocked(getPendingReferral).mockReturnValue('VYX-ZZZZZZ');
    await captureInstallReferrer();
    vi.mocked(getPendingReferral).mockReturnValue(null);
    vi.mocked(hasRedeemed).mockReturnValue(true);
    await captureInstallReferrer();
    expect(getInstallReferrer).not.toHaveBeenCalled();
  });
});

// #2569: the Create Wallet invite field used to call setPendingReferral directly,
// skipping validation, the capture event and the deniability re-check.
describe('captureReferralCode (manual entry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    vi.mocked(getPendingReferral).mockReturnValue(null);
  });

  it('stores a valid code, normalised, and emits source manual_entry', () => {
    expect(captureReferralCode('  vyx-ab3def ')).toBe(true);
    expect(setPendingReferral).toHaveBeenCalledWith('VYX-AB3DEF');
    expect(trackEvent).toHaveBeenCalledWith('referral_code_applied', { code: 'VYX-AB3DEF', source: 'manual_entry' });
  });

  it.each(['VYX-ABC', 'VYX-AB3DE0', 'ABC-AB3DEF', 'VYX-AB3DEF?x=1', ''])('rejects %j without storing or emitting', (raw) => {
    expect(captureReferralCode(raw)).toBe(false);
    expect(setPendingReferral).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('reports a valid code as valid but stores nothing in a deniable session', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(captureReferralCode('VYX-AB3DEF')).toBe(true);
    expect(setPendingReferral).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
