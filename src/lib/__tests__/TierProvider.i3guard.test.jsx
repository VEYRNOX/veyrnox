// src/lib/__tests__/TierProvider.i3guard.test.jsx
//
// I3 (deniability = ZERO backend calls) for the app-global TierProvider.
//
// TierProvider is mounted app-globally and its effect fires the RevenueCat SDK
// (configurePurchases) + registers a persistent customer-info listener at cold
// start. Under a deniability (decoy/hidden) session this MUST NOT happen:
//   1. In a deniability session, configurePurchases is NEVER called.
//   2. A customer-info listener callback (even one registered in a prior primary
//      session) must NOT deliver a paid tier into a deniability session — the
//      tier stays 'free'.
// The invariant: ZERO RevenueCat egress + no paid tier under isDeniabilitySessionActive().

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

import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';
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
  configurePurchases.mockImplementation(async () => {});
  resolveTier.mockResolvedValue('free');
  setDeniabilitySession(false);
});

describe('TierProvider — I3 deniability guard', () => {
  it('does NOT call configurePurchases while a deniability session is active', async () => {
    setDeniabilitySession(true);
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(configurePurchases).not.toHaveBeenCalled();
    expect(screen.getByTestId('tier').textContent).toBe('free');
    setDeniabilitySession(false);
  });

  it('a customer-info listener does NOT deliver a paid tier in a deniability session', async () => {
    // Register in a primary session (listener captured), then a deniability
    // session opens; a late customer-info event must NOT flip the tier to paid.
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
    await waitFor(() => expect(capturedListener).not.toBeNull());

    setDeniabilitySession(true);
    act(() => {
      capturedListener({ entitlements: { active: { safety_plus: {} } } });
    });
    expect(screen.getByTestId('tier').textContent).toBe('free');
    setDeniabilitySession(false);
  });
});
