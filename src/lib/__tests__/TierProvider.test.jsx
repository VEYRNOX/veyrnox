// src/lib/__tests__/TierProvider.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const resolveTier = vi.fn();
vi.mock('../entitlement', () => ({ resolveTier: () => resolveTier() }));

let capturedListener = null;
const unsubscribe = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
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
});

describe('TierProvider', () => {
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
