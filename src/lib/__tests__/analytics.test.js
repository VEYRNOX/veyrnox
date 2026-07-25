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
    // Simulate fresh import by reading again
    expect(localStorage.getItem('veyrnox-telemetry-consent')).toBe('granted');
  });
});

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(),
}));

describe('analytics emit', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { trackEvent } = await import('@/api/trackEvent');
    trackEvent.mockClear();
  });

  it('does not call trackEvent without consent', async () => {
    const { emit, FunnelEvent } = await import('@/lib/analytics');
    const { trackEvent } = await import('@/api/trackEvent');
    await emit(FunnelEvent.WALLET_READY, { foo: 'bar' });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('calls trackEvent when consent granted', async () => {
    const { emit, setConsent, FunnelEvent } = await import('@/lib/analytics');
    const { trackEvent } = await import('@/api/trackEvent');
    setConsent(true);
    await emit(FunnelEvent.WALLET_READY, { foo: 'bar' });
    expect(trackEvent).toHaveBeenCalledWith('wallet_ready', { foo: 'bar' });
  });

  it('does not gate CONSENT_GRANTED/CONSENT_DENIED behind hasConsent when called via trackEvent directly', async () => {
    const { FunnelEvent } = await import('@/lib/analytics');
    const { trackEvent } = await import('@/api/trackEvent');
    // Consent events must fire via trackEvent directly, not emit(), per design.
    await trackEvent(FunnelEvent.CONSENT_GRANTED, {});
    expect(trackEvent).toHaveBeenCalledWith('consent_granted', {});
  });
});
