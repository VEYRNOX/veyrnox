// src/lib/__tests__/TierProvider.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const resolveTier = vi.fn();
vi.mock('../entitlement', () => ({ resolveTier: () => resolveTier() }));

let capturedListener = null;
const unsubscribe = vi.fn();
const configurePurchases = vi.fn(async () => {});
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  AI_SECURITY_PROTECTION_ENTITLEMENT: 'ai_security_protection',
  configurePurchases: (...a) => configurePurchases(...a),
  addCustomerInfoUpdateListener: async (cb) => {
    capturedListener = cb;
    return unsubscribe;
  },
}));

const { TierProvider, useTier } = await import('../TierProvider');

function Probe() {
  const { currentTier, loading } = useTier();
  return (
    <div>
      <span data-testid="tier">{currentTier}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedListener = null;
  // Re-establish the default resolved impl each test (clearAllMocks keeps the
  // initial vi.fn impl, but a per-test mockReturnValue override would leak).
  configurePurchases.mockImplementation(async () => {});
});

describe('TierProvider', () => {
  it('configures the purchases SDK on mount', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(configurePurchases).toHaveBeenCalled());
  });

  it('awaits SDK configuration before the first tier resolve', async () => {
    let releaseConfigure;
    configurePurchases.mockReturnValue(new Promise((r) => { releaseConfigure = r; }));
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    // configure has been called, but resolveTier must NOT run until it resolves.
    await waitFor(() => expect(configurePurchases).toHaveBeenCalled());
    expect(resolveTier).not.toHaveBeenCalled();
    releaseConfigure();
    await waitFor(() => expect(resolveTier).toHaveBeenCalled());
  });

  it('still resolves the tier (fail-closed) when SDK configuration rejects', async () => {
    configurePurchases.mockRejectedValue(new Error('REVENUECAT_API_KEY_MISSING'));
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('tier').textContent).toBe('free');
  });

  it('starts loading=true, free, then resolves to the real tier', async () => {
    resolveTier.mockResolvedValue('safety_plus');
    render(<TierProvider><Probe /></TierProvider>);
    expect(screen.getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('tier').textContent).toBe('safety_plus');
  });

  it('updates currentTier live when the customer-info listener fires', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
    await waitFor(() => expect(capturedListener).not.toBeNull());

    act(() => {
      capturedListener({ entitlements: { active: { safety_plus: { isActive: true } } } });
    });

    expect(screen.getByTestId('tier').textContent).toBe('safety_plus');
  });

  it('prefers ai_security_protection when that listener entitlement is active', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
    await waitFor(() => expect(capturedListener).not.toBeNull());

    act(() => {
      capturedListener({ entitlements: { active: { ai_security_protection: { isActive: true } } } });
    });

    expect(screen.getByTestId('tier').textContent).toBe('ai_security_protection');
  });

  it('unsubscribes the listener on unmount', async () => {
    resolveTier.mockResolvedValue('free');
    const { unmount } = render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    await waitFor(() => expect(capturedListener).not.toBeNull());
    unmount();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });
});

describe('TierProvider — subscription lifecycle (display only)', () => {
  beforeEach(() => { localStorage.clear(); });
  function SubProbe() {
    const { currentTier, subscription } = useTier();
    return (
      <div>
        <span data-testid="tier2">{currentTier}</span>
        <span data-testid="sub">{subscription.status}</span>
      </div>
    );
  }
  const liveEnt = (over = {}) => ({ entitlements: { active: { safety_plus: { isActive: true, willRenew: true, expirationDate: '2027-03-01T00:00:00Z', ...over } } } });

  it('listener: willRenew=false shows cancelled while the tier stays paid', async () => {
    resolveTier.mockResolvedValue('safety_plus');
    render(<TierProvider><SubProbe /></TierProvider>);
    await waitFor(() => expect(capturedListener).toBeTruthy());
    await act(async () => { capturedListener(liveEnt({ willRenew: false })); });
    expect(screen.getByTestId('tier2').textContent).toBe('safety_plus');
    expect(screen.getByTestId('sub').textContent).toBe('cancelled');
  });

  it('listener: lapse after a paid period shows expired and the tier is free', async () => {
    resolveTier.mockResolvedValue('safety_plus');
    render(<TierProvider><SubProbe /></TierProvider>);
    await waitFor(() => expect(capturedListener).toBeTruthy());
    await act(async () => { capturedListener(liveEnt()); });
    await act(async () => { capturedListener({ entitlements: { active: {} } }); });
    expect(screen.getByTestId('tier2').textContent).toBe('free');
    expect(screen.getByTestId('sub').textContent).toBe('expired');
  });

  it('a never-paid user sees no subscription state', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><SubProbe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier2').textContent).toBe('free'));
    await act(async () => { capturedListener({ entitlements: { active: {} } }); });
    expect(screen.getByTestId('sub').textContent).toBe('none');
  });

  it('a store outage (tier resolves free, detail unreadable) never reads as expired', async () => {
    localStorage.setItem('veyrnox-last-paid-sub', JSON.stringify({ tier: 'safety_plus', expiresAt: 1 }));
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><SubProbe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier2').textContent).toBe('free'));
    // purchases mock has no getCustomerInfo => resolveSubscriptionDetail is unreachable
    expect(screen.getByTestId('sub').textContent).toBe('none');
  });
});
