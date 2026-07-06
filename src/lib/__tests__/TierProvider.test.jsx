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
  configurePurchases: (...a) => configurePurchases(...a),
  addCustomerInfoUpdateListener: async (cb) => {
    capturedListener = cb;
    return unsubscribe;
  },
}));

const { TierProvider, useTier } = await import('../TierProvider');

function Probe() {
  const { currentTier, loading, tiers } = useTier();
  return (
    <div>
      <span data-testid="tier">{currentTier}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="tier-count">{tiers.length}</span>
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

  it('exposes the full tier catalogue', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(Number(screen.getByTestId('tier-count').textContent)).toBe(2);
  });

  it('updates currentTier live when the customer-info listener fires', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
    await waitFor(() => expect(capturedListener).not.toBeNull());

    act(() => {
      capturedListener({ entitlements: { active: { safety_plus: {} } } });
    });

    expect(screen.getByTestId('tier').textContent).toBe('safety_plus');
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
