import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setConsent, hasConsent, getConsentState } from '@/lib/analytics';

describe('analytics consent', () => {
  beforeEach(() => localStorage.clear());

  it('returns null before any choice', () => {
    expect(getConsentState()).toBe(null);
    expect(hasConsent()).toBe(false);
  });

  it('stores granted', () => {
    setConsent(true);
    expect(hasConsent()).toBe(true);
    expect(getConsentState()).toBe('granted');
  });

  it('stores denied', () => {
    setConsent(false);
    expect(hasConsent()).toBe(false);
    expect(getConsentState()).toBe('denied');
  });

  it('persists across reads', () => {
    setConsent(true);
    expect(localStorage.getItem('veyrnox-telemetry-consent')).toBe('granted');
  });
});

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(),
}));

// emit() is now a thin pass-through: consent is enforced inside trackEvent()
// so that the call sites which bypass emit() are covered too. These tests
// assert the delegation only — the gate itself is tested against the real
// implementation in src/api/__tests__/trackEvent.test.js, which is where a
// meaningful consent test has to live now.
//
// (The previous file also contained a test that called the trackEvent MOCK and
// then asserted the mock had been called. That asserted nothing about the
// code under test and would have passed no matter how consent behaved.)
describe('analytics emit', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { trackEvent } = await import('@/api/trackEvent');
    trackEvent.mockClear();
  });

  it('forwards the event name and metadata to trackEvent', async () => {
    const { emit, FunnelEvent } = await import('@/lib/analytics');
    const { trackEvent } = await import('@/api/trackEvent');

    await emit(FunnelEvent.WALLET_READY, { foo: 'bar' });

    expect(trackEvent).toHaveBeenCalledWith('wallet_ready', { foo: 'bar' });
  });

  it('defaults metadata to an empty object', async () => {
    const { emit, FunnelEvent } = await import('@/lib/analytics');
    const { trackEvent } = await import('@/api/trackEvent');

    await emit(FunnelEvent.FIRST_SEND);

    expect(trackEvent).toHaveBeenCalledWith('first_send', {});
  });
});
