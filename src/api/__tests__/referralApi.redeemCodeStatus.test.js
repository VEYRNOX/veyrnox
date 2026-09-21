// #2640 — redeemCode() used to collapse every non-404 failure to status 500,
// so WalletProvider's unlock()-time redemption block could not tell a
// permanent rejection (4xx) from a transient one (429 rate-limited, 5xx, or a
// network failure that never got an HTTP response at all). This pins that
// redeemCode() now preserves the real status — or no status at all for a
// network failure — instead of manufacturing one.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/api/edgeApi', () => ({
  rpc: (...args) => rpc(...args),
  edgeFn: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));
vi.mock('@/lib/deviceId', () => ({
  getOrCreateDeviceId: () => '11111111-2222-4333-8444-555555555555',
}));

const CODE = 'VYX-STRKLB';

function httpError(status, message = 'RPC increment_referral failed') {
  return Object.assign(new Error(message), { status });
}

describe('redeemCode — #2640 status classification', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('resolves on success', async () => {
    rpc.mockResolvedValue(3);
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).resolves.toEqual({ newCount: 3 });
  });

  it('a 404 (code not found) throws status 404', async () => {
    rpc.mockRejectedValue(httpError(404));
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).rejects.toMatchObject({ status: 404 });
  });

  it('a message containing "not found" is normalised to 404 regardless of the real status', async () => {
    rpc.mockRejectedValue(httpError(400, 'Code not found: VYX-STRKLB'));
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).rejects.toMatchObject({ status: 404 });
  });

  it('a 429 (rate limited) preserves status 429, not 500', async () => {
    rpc.mockRejectedValue(httpError(429, 'Too many requests'));
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).rejects.toMatchObject({ status: 429 });
  });

  it('a 5xx preserves the real status, not a manufactured 500', async () => {
    rpc.mockRejectedValue(httpError(503, 'Database not configured'));
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).rejects.toMatchObject({ status: 503 });
  });

  it('a permanent 4xx (e.g. 409 duplicate) preserves that status', async () => {
    rpc.mockRejectedValue(httpError(409, 'Already redeemed'));
    const { redeemCode } = await import('@/api/referralApi');
    await expect(redeemCode(CODE)).rejects.toMatchObject({ status: 409 });
  });

  it('a network failure (no HTTP response, no .status) rethrows with status undefined', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const { redeemCode } = await import('@/api/referralApi');
    const err = await redeemCode(CODE).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBeUndefined();
  });

  it('an aborted request (timeout, no .status) rethrows with status undefined', async () => {
    rpc.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));
    const { redeemCode } = await import('@/api/referralApi');
    const err = await redeemCode(CODE).catch((e) => e);
    expect(err.status).toBeUndefined();
  });
});
