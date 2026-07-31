// Regression: audit finding H-2 (2026-07-28).
//
// `register_referral_code(p_code, p_device_id)` rate-limits per
// device_id. The previous SQL only enforced the 3-per-hour cap when
// `p_device_id IS NOT NULL`, so a client that omitted the argument
// (or passed null) could mint unlimited codes. The SQL now REJECTS
// NULL. This test locks the matching client-side invariant: if the
// device id is unavailable, `registerCode()` must not issue the RPC
// at all — no doomed round-trip, and no chance of us reintroducing
// a nullable arg on the wire.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc } }));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));
const getOrCreateDeviceId = vi.fn();
vi.mock('@/lib/deviceId', () => ({
  getOrCreateDeviceId: (...args) => getOrCreateDeviceId(...args),
}));
vi.mock('@/lib/purchases', () => ({
  getAppUserId: vi.fn().mockResolvedValue(null),
}));

const VALID_CODE = 'VYX-ABCDEF';

describe('registerCode — H-2 device_id required', () => {
  beforeEach(() => {
    rpc.mockClear();
    getOrCreateDeviceId.mockReset();
  });

  it('does not call the RPC when deviceId is null (no CSPRNG)', async () => {
    getOrCreateDeviceId.mockReturnValue(null);
    const { registerCode } = await import('@/api/referralApi');
    await registerCode(VALID_CODE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not call the RPC when deviceId is undefined', async () => {
    getOrCreateDeviceId.mockReturnValue(undefined);
    const { registerCode } = await import('@/api/referralApi');
    await registerCode(VALID_CODE);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes p_device_id on the RPC when a deviceId exists', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    getOrCreateDeviceId.mockReturnValue(id);
    const { registerCode } = await import('@/api/referralApi');
    await registerCode(VALID_CODE);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('register_referral_code');
    expect(args.p_device_id).toBe(id);
    expect(args.p_code).toBe(VALID_CODE);
  });
});
