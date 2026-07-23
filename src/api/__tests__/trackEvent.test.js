import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockSupabase;
let mockIsDeniabilityOrDemoActive;
let mockDEMO;

vi.mock('@/lib/supabaseClient', () => ({
  get supabase() { return mockSupabase; },
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: (...args) => mockIsDeniabilityOrDemoActive(...args),
}));

vi.mock('@/api/demoClient', () => ({
  get DEMO() { return mockDEMO; },
}));

vi.mock('@/lib/deviceId', () => {
  let _id = null;
  return {
    getOrCreateDeviceId: () => {
      if (_id) return _id;
      _id = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
      try { localStorage.setItem('veyrnox-device-id', _id); } catch {}
      return _id;
    },
    __resetForTest: () => { _id = null; },
  };
});

const { trackEvent, EVENT } = await import('../trackEvent');
const deviceIdMod = await import('@/lib/deviceId');

describe('trackEvent', () => {
  beforeEach(() => {
    mockSupabase = { rpc: vi.fn(() => Promise.resolve({ error: null })) };
    mockIsDeniabilityOrDemoActive = vi.fn(() => false);
    mockDEMO = false;
    localStorage.clear();
    deviceIdMod.__resetForTest?.();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('calls track_event RPC with correct params', async () => {
    await trackEvent(EVENT.WALLET_CREATED, { foo: 'bar' });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('track_event', {
      p_device_id: 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee',
      p_event: 'wallet_created',
      p_metadata: { foo: 'bar' },
    });
  });

  it('no-ops when supabase is null', async () => {
    mockSupabase = null;
    await expect(trackEvent('test_event')).resolves.toBeUndefined();
  });

  it('no-ops when DEMO is true (load-time gate)', async () => {
    mockDEMO = true;

    await trackEvent('test_event');

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem('veyrnox-device-id')).toBeNull();
  });

  it('no-ops when deniability/demo is active (I2/I3)', async () => {
    mockIsDeniabilityOrDemoActive.mockReturnValue(true);

    await trackEvent('test_event');

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem('veyrnox-device-id')).toBeNull();
  });

  it('reuses the same device_id across calls', async () => {
    await trackEvent('a');
    await trackEvent('b');

    const calls = mockSupabase.rpc.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_device_id).toBe(calls[1][1].p_device_id);
    expect(calls[0][1].p_device_id).toBeTruthy();
  });

  it('swallows RPC errors silently', async () => {
    mockSupabase.rpc = vi.fn(() => Promise.reject(new Error('network')));
    await expect(trackEvent('test_event')).resolves.toBeUndefined();
  });

  it('exports expected event constants', () => {
    expect(EVENT.WALLET_CREATED).toBe('wallet_created');
    expect(EVENT.WALLET_IMPORTED).toBe('wallet_imported');
    expect(EVENT.SESSION_START).toBe('session_start');
    expect(EVENT.SEND_COMPLETED).toBe('send_completed');
    expect(EVENT.RECEIVE_VIEWED).toBe('receive_viewed');
    expect(EVENT.WC_SESSION_APPROVED).toBe('wc_session_approved');
    expect(EVENT.BACKUP_CONFIRMED).toBe('backup_confirmed');
  });
});
