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
    // trackEvent is the consent chokepoint, so the happy-path cases below
    // need an explicit grant. The consent gate itself is covered separately.
    localStorage.setItem('veyrnox-telemetry-consent', 'granted');
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
    await trackEvent(EVENT.WALLET_CREATED);
    await trackEvent(EVENT.SESSION_START);

    const calls = mockSupabase.rpc.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_device_id).toBe(calls[1][1].p_device_id);
    expect(calls[0][1].p_device_id).toBeTruthy();
  });

  it('swallows RPC errors silently', async () => {
    mockSupabase.rpc = vi.fn(() => Promise.reject(new Error('network')));
    await expect(trackEvent('test_event')).resolves.toBeUndefined();
  });

  // REGRESSION: consent used to be enforced only in analytics.js emit(), so
  // the 11 call sites that invoke trackEvent() directly (WalletProvider,
  // SendCrypto, ReceiveCrypto, WalletConnectProvider, referral, paywall)
  // uploaded events from users who had explicitly declined. The gate lives
  // here now precisely so no call site can opt out of it.
  describe('consent gate', () => {
    it('no-ops when consent was explicitly denied', async () => {
      localStorage.setItem('veyrnox-telemetry-consent', 'denied');

      await trackEvent(EVENT.WALLET_CREATED);

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('no-ops when consent was never answered (absent != consent)', async () => {
      localStorage.removeItem('veyrnox-telemetry-consent');

      await trackEvent(EVENT.WALLET_CREATED);

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('does not mint a device id for a user who declined', async () => {
      localStorage.setItem('veyrnox-telemetry-consent', 'denied');

      await trackEvent(EVENT.SEND_COMPLETED);

      expect(localStorage.getItem('veyrnox-device-id')).toBeNull();
    });

    it('gates the direct-call sites, not just emit()', async () => {
      localStorage.setItem('veyrnox-telemetry-consent', 'denied');

      for (const e of [
        EVENT.WALLET_CREATED, EVENT.WALLET_IMPORTED, EVENT.SESSION_START,
        EVENT.SEND_COMPLETED, EVENT.RECEIVE_VIEWED, EVENT.WC_SESSION_APPROVED,
        EVENT.BACKUP_CONFIRMED, EVENT.REFERRAL_CODE_APPLIED,
        EVENT.PAYWALL_SHOWN, EVENT.PAYWALL_DISMISSED, EVENT.PAYWALL_CONVERTED,
      ]) {
        await trackEvent(e);
      }

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('allows events once consent is granted', async () => {
      localStorage.setItem('veyrnox-telemetry-consent', 'granted');

      await trackEvent(EVENT.WALLET_CREATED);

      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    });
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

  it('includes growth analytics events', () => {
    expect(EVENT.REFERRAL_CODE_APPLIED).toBe('referral_code_applied');
    expect(EVENT.PAYWALL_SHOWN).toBe('paywall_shown');
    expect(EVENT.PAYWALL_DISMISSED).toBe('paywall_dismissed');
    expect(EVENT.PAYWALL_CONVERTED).toBe('paywall_converted');
  });
});
