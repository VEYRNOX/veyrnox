// src/lib/__tests__/TierProvider.race.test.jsx
//
// Codex P2 (2026-07-17) — TierProvider.jsx:65 race condition:
// The initial resolveTier() promise, if it resolves AFTER a synchronous flip
// into a deniability session, can overwrite the flip-forced 'free' with a
// stale 'safety_plus' (a paid-tier leak into decoy UI — an I-2 tell).
//
// The same race exists on the flip-FALSE path: a re-resolve fires, then the
// user flips back TRUE before the promise resolves; the stale primary-session
// resolve then overwrites the second flip-TRUE force.
//
// Fix pattern: generation token. Every async resolveTier() invocation captures
// a generation; commits are discarded if the generation has advanced. The
// flip-TRUE force-'free' path bumps the generation so any in-flight resolve
// is invalidated.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// A controllable promise factory: each call to resolveTier() returns a new
// pending promise whose resolve/reject we can drive from the test.
const pending = [];
const resolveTier = vi.fn(() => {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  pending.push({ resolve, reject, promise: p });
  return p;
});
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
  const { currentTier } = useTier();
  return <span data-testid="tier">{currentTier}</span>;
}

async function flushMicrotasks() {
  // Let the internal configurePurchases microtask + async closure entry run.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  configurePurchases.mockImplementation(async () => {});
  setDeniabilitySession(false);
});

describe('TierProvider — resolveTier race on mid-flight deniability flip (Codex P2)', () => {
  it('discards a stale initial resolve that lands AFTER a flip TRUE', async () => {
    render(<TierProvider><Probe /></TierProvider>);

    // Let the mount effect kick off the initial resolveTier() call.
    await waitFor(() => expect(resolveTier).toHaveBeenCalled());
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const initial = pending[0];

    // Mid-flight: user flips into a deniability session BEFORE the promise resolves.
    act(() => { setDeniabilitySession(true); });

    // The flip listener forces 'free' locally.
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    // NOW the stale initial resolve lands with 'safety_plus'. Before the fix
    // this leaked back into the UI (the async closure had no generation check).
    await act(async () => { initial.resolve('safety_plus'); await Promise.resolve(); });

    // Must STILL be 'free' — the stale resolve is discarded by the generation token.
    expect(screen.getByTestId('tier').textContent).toBe('free');
  });

  it('discards a stale flip-FALSE re-resolve when a second flip TRUE lands first', async () => {
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(resolveTier).toHaveBeenCalled());

    // Land the initial resolve so we get to a stable 'free' baseline.
    const initial = pending[0];
    await act(async () => { initial.resolve('free'); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    // Enter deniability, then exit → refreshTier() fires a re-resolve.
    act(() => { setDeniabilitySession(true); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    act(() => { setDeniabilitySession(false); });
    await flushMicrotasks();
    // A new resolveTier() call was queued by the flip-FALSE branch.
    const reResolveIdx = pending.length - 1;
    expect(reResolveIdx).toBeGreaterThan(0);
    const staleReResolve = pending[reResolveIdx];

    // Before that resolves, the user flips back into deniability.
    act(() => { setDeniabilitySession(true); });
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));

    // Now the stale flip-FALSE re-resolve lands with 'safety_plus'.
    await act(async () => { staleReResolve.resolve('safety_plus'); await Promise.resolve(); });

    // Must STILL be 'free' — the second flip-TRUE bumped the generation.
    expect(screen.getByTestId('tier').textContent).toBe('free');
  });
});
