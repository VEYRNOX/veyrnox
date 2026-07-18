// src/lib/__tests__/TierProvider.deniability-cache.test.jsx
//
// I-2 fix — cached `safety_plus` tier survives mid-session deniability entry.
//
// TierProvider mounts, resolveTier() returns 'safety_plus' from a real RC
// customer-info. Later, WalletProvider opens a decoy/hidden session and calls
// setDeniabilitySession(true). Before this fix the cached currentTier stayed
// 'safety_plus' (resolveTier was not re-run and no event flipped it) — so the
// Manage-subscription button and SafetyPlus "unlocked" copy leaked paid-tier
// state into the decoy UI (an I-2 / deniability tell).
//
// Fix: TierProvider subscribes to DENIABILITY_SESSION_CHANGED_EVENT. On flip
// true it forces currentTier='free' locally (no RC egress — I3). On flip false
// it re-runs resolveTier() to pick up the real value. FORCED_TIER short-circuits
// the callback (dev override honesty).

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const resolveTier = vi.fn();
vi.mock('../entitlement', () => ({ resolveTier: () => resolveTier() }));

const configurePurchases = vi.fn(async () => {});
const unsubscribe = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  configurePurchases: (...a) => configurePurchases(...a),
  addCustomerInfoUpdateListener: async () => unsubscribe,
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
  configurePurchases.mockImplementation(async () => {});
  resolveTier.mockResolvedValue('safety_plus');
  setDeniabilitySession(false);
});

describe('TierProvider — deniability cache invalidation (I-2)', () => {
  it('flips currentTier to "free" when a deniability session opens mid-session', async () => {
    render(<TierProvider><Probe /></TierProvider>);
    // Initial resolve: safety_plus (paid user in primary session).
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('safety_plus'));

    // Mid-session: WalletProvider opens a decoy/hidden session.
    act(() => { setDeniabilitySession(true); });

    // Cached paid tier must NOT leak into decoy UI — force to 'free'.
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
  });

  it('does NOT re-resolve (no RC egress) on flip TRUE — forces "free" locally', async () => {
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('safety_plus'));

    const callsBefore = resolveTier.mock.calls.length;
    act(() => { setDeniabilitySession(true); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    // I3: no extra resolveTier() call — flip-true is a local force, no egress.
    expect(resolveTier.mock.calls.length).toBe(callsBefore);
  });

  it('re-resolves on flip FALSE (deniability exits → primary session)', async () => {
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('safety_plus'));

    act(() => { setDeniabilitySession(true); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    // Deniability exits; the "real" tier should be recomputed.
    resolveTier.mockResolvedValue('safety_plus');
    const callsBefore = resolveTier.mock.calls.length;
    act(() => { setDeniabilitySession(false); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('safety_plus'));
    expect(resolveTier.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('FORCED_TIER (dev override) short-circuits — deniability flip does not touch tier', async () => {
    // Simulate the FORCED_TIER short-circuit by stubbing the env before import.
    // The already-imported TierProvider has FORCED_TIER=null in this test env, so
    // simulate the invariant by asserting: when resolveTier returns 'safety_plus'
    // and we re-mount with a stub that forces the callback to skip, the flip does
    // nothing. We simulate FORCED_TIER by pre-freezing tier state: the guard in
    // the listener body is `if (FORCED_TIER) return;` — verified by module read.
    // (Defence-in-depth pin; full E2E dev-override coverage lives in Subscription tests.)
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/TierProvider.jsx'), 'utf8');
    // The listener body must guard on FORCED_TIER before mutating tier state.
    expect(src).toMatch(/DENIABILITY_SESSION_CHANGED_EVENT/);
    expect(src).toMatch(/if\s*\(\s*FORCED_TIER\s*\)\s*return/);
  });
});
