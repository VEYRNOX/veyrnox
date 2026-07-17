// @ts-nocheck
// src/components/__tests__/GasTracker.refetch-egress.test.jsx
//
// I3 deniability guard (issue #1095) — third instance of the react-query v5
// refetch()-bypasses-`enabled` bug class (previously fixed in PR #614
// CryptoNewsFeed/Calculator, PR #925). GasTracker's `enabled: egressAllowed`
// gate stops the automatic query, but the header Refresh button called
// `refetch()` directly, unconditionally — a decoy/hidden/DEMO session could
// still fire 3 live third-party fetches (mempool.space, api.etherscan.io,
// api.devnet.solana.com) by tapping Refresh.
//
// Fix: hide (not disable) the Refresh button when `egressAllowed` is false,
// matching the CryptoNewsFeed.jsx pattern. A disabled-but-visible button is
// still a UI tell, so the button must not render at all.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const walletState = { isDecoy: false, isHidden: false };
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

let GasTracker;
beforeEach(async () => {
  walletState.isDecoy = false;
  walletState.isHidden = false;
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  );
  ({ default: GasTracker } = await import('@/components/GasTracker'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTracker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GasTracker />
    </QueryClientProvider>
  );
}

describe('GasTracker — I3 refetch() trigger (behavioral)', () => {
  it('hides the Refresh button in a decoy session (no refetch() egress)', () => {
    walletState.isDecoy = true;
    renderTracker();
    expect(screen.queryByLabelText(/refresh gas fees/i)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('hides the Refresh button in a hidden session', () => {
    walletState.isHidden = true;
    renderTracker();
    expect(screen.queryByLabelText(/refresh gas fees/i)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the Refresh button in a normal session and clicking it triggers a refetch', async () => {
    renderTracker();
    const btn = await screen.findByLabelText(/refresh gas fees/i);
    expect(btn).not.toBeNull();

    const fetchCallsBefore = global.fetch.mock.calls.length;
    btn.click();

    // The click must reach refetch() → fetchFees() → global.fetch (not blocked).
    await vi.waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(fetchCallsBefore);
    });
  });
});
