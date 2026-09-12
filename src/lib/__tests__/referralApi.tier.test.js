// fetchReferralTier — the paywall's only input for a referee's discount.
//
// The server (sql/get-referral-tier.sql) returns a tier KEY, and that key is
// composed straight into a RevenueCat offering id (`referral-<tier>`). I5: the
// backend is untrusted, so the client must accept only the four keys it knows
// and map everything else — 'none', NULL, a typo, a hostile string — to "no
// offer". These pins fail if the allowlist is widened or removed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/api/edgeApi', () => ({
  rpc: (...args) => rpc(...args),
  edgeFn: vi.fn().mockResolvedValue(null),
}));
const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
}));
vi.mock('@/lib/deviceId', () => ({
  getOrCreateDeviceId: () => '11111111-2222-4333-8444-555555555555',
}));

const CODE = 'VYX-STRKLB';

describe('fetchReferralTier', () => {
  beforeEach(() => {
    rpc.mockReset();
    isDeniabilityOrDemoActive.mockReturnValue(false);
  });

  it('calls get_referral_tier with the code and returns a known tier key', async () => {
    rpc.mockResolvedValue('platinum');
    const { fetchReferralTier } = await import('@/api/referralApi');
    await expect(fetchReferralTier(CODE)).resolves.toBe('platinum');
    expect(rpc).toHaveBeenCalledWith('get_referral_tier', { p_code: CODE });
  });

  it.each([
    ['the no-tier sentinel', 'none'],
    ['NULL (unknown code)', null],
    ['an unknown tier string', 'diamond'],
    ['a non-string', 15],
    ['an offering-id shaped string', 'referral-platinum'],
  ])('returns null for %s from the server', async (_label, value) => {
    rpc.mockResolvedValue(value);
    const { fetchReferralTier } = await import('@/api/referralApi');
    await expect(fetchReferralTier(CODE)).resolves.toBeNull();
  });

  it('returns null and never calls the RPC for a malformed code', async () => {
    const { fetchReferralTier } = await import('@/api/referralApi');
    await expect(fetchReferralTier('VYX-STRIKE')).resolves.toBeNull(); // I excluded
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns null and never calls the RPC in a deniability/demo session (I3)', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { fetchReferralTier } = await import('@/api/referralApi');
    await expect(fetchReferralTier(CODE)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns null when the RPC throws (I4: no offer, never a crash)', async () => {
    rpc.mockRejectedValue(new Error('502'));
    const { fetchReferralTier } = await import('@/api/referralApi');
    await expect(fetchReferralTier(CODE)).resolves.toBeNull();
  });
});
