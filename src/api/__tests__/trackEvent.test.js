import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockSupabase;
let mockIsDeniabilityOrDemoActive;

vi.mock('@/lib/supabaseClient', () => ({
  get supabase() { return mockSupabase; },
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: (...args) => mockIsDeniabilityOrDemoActive(...args),
}));

const { trackEvent, EVENT } = await import('../trackEvent');

describe('trackEvent', () => {
  beforeEach(() => {
    mockSupabase = { from: vi.fn(() => ({ insert: vi.fn(() => Promise.resolve({ error: null })) })) };
    mockIsDeniabilityOrDemoActive = vi.fn(() => false);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('inserts an event row into Supabase', async () => {
    const insertFn = vi.fn(() => Promise.resolve({ error: null }));
    mockSupabase.from = vi.fn(() => ({ insert: insertFn }));

    await trackEvent(EVENT.WALLET_CREATED, { foo: 'bar' });

    expect(mockSupabase.from).toHaveBeenCalledWith('events');
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      event: 'wallet_created',
      metadata: { foo: 'bar' },
    }));
    const arg = insertFn.mock.calls[0][0];
    expect(arg.device_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no-ops when supabase is null', async () => {
    mockSupabase = null;
    await expect(trackEvent('test_event')).resolves.toBeUndefined();
  });

  it('no-ops when deniability/demo is active (I2/I3)', async () => {
    mockIsDeniabilityOrDemoActive.mockReturnValue(true);
    const insertFn = vi.fn();
    mockSupabase.from = vi.fn(() => ({ insert: insertFn }));

    await trackEvent('test_event');

    expect(insertFn).not.toHaveBeenCalled();
  });

  it('reuses the same device_id across calls', async () => {
    const ids = [];
    const insertFn = vi.fn((row) => { ids.push(row.device_id); return Promise.resolve({ error: null }); });
    mockSupabase.from = vi.fn(() => ({ insert: insertFn }));

    await trackEvent('a');
    await trackEvent('b');

    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBeTruthy();
  });

  it('swallows insert errors silently', async () => {
    mockSupabase.from = vi.fn(() => ({ insert: vi.fn(() => Promise.reject(new Error('network'))) }));
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
