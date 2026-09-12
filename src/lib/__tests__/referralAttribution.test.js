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

import { captureReferralFromUrl, referralCodeFromUrl } from '@/lib/referralAttribution';
import { setPendingReferral, getPendingReferral } from '@/lib/referral';
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
