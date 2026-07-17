// @ts-nocheck
// src/pages/__tests__/FeeAnalytics.refetch-egress.test.jsx
//
// I3 deniability guard (issue #1120) — pre-existing instance of the react-query
// v5 refetch()-bypasses-`enabled` bug class (previously fixed for GasTracker,
// issue #1095, PR #1118; original bug class PRs #614/#925). FeeAnalytics'
// `enabled: egressAllowed` gate stops the automatic query, but its Retry
// (error state) and Refresh (available-analytics state) buttons both called
// `refetch()` directly, unconditionally — a decoy/hidden session with stale
// cached data (or a session flip mid-mount) could still fire the live
// address->indexer disclosure by tapping either button.
//
// Fix: hide (not disable) both buttons when `egressAllowed` is false, matching
// GasTracker's pattern. useQuery itself is mocked so each render can force the
// isError and analytics-available branches directly, independent of the real
// query-key/cache plumbing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let deniabilityActive = false;
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilitySessionActive: () => deniabilityActive,
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ accounts: [{ address: '0xabc' }], btcAccount: { address: 'bc1qabc' }, solAccount: { address: 'Sol111' } }),
}));

let queryResult;
const refetchSpy = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryResult,
}));

vi.mock('@/lib/txHistory', () => ({
  fetchAssetHistory: vi.fn(),
  explorerAddressUrl: () => 'https://explorer.example/addr',
}));

vi.mock('@/analytics/feeAnalytics', () => ({
  computeFeeAnalytics: () => ({
    available: true,
    paidTxCount: 2,
    totalFeeNative: '0.001',
    avgFeeNative: '0.0005',
    maxFeeNative: '0.0006',
    unknownFeeCount: 0,
    assetSymbol: 'BTC',
    perTx: [],
  }),
}));

let FeeAnalytics;
beforeEach(async () => {
  deniabilityActive = false;
  refetchSpy.mockClear();
  vi.resetModules();
  ({ default: FeeAnalytics } = await import('@/pages/FeeAnalytics'));
});
afterEach(() => {
  cleanup();
});

function setAvailableAnalyticsResult() {
  queryResult = {
    data: { supported: true, source: { networkName: 'Bitcoin', privacyNote: 'note' }, transactions: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
    isFetching: false,
  };
}

function setErrorResult() {
  queryResult = {
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error('boom'),
    refetch: refetchSpy,
    isFetching: false,
  };
}

describe('FeeAnalytics — I3 refetch() trigger (behavioral, #1120)', () => {
  it('hides the Refresh button (available-analytics state) in a deniability session', () => {
    deniabilityActive = true;
    setAvailableAnalyticsResult();
    render(<FeeAnalytics />);
    expect(screen.queryByText(/^refresh$/i)).toBeNull();
  });

  it('hides the Retry button (error state) in a deniability session', () => {
    deniabilityActive = true;
    setErrorResult();
    render(<FeeAnalytics />);
    expect(screen.queryByText(/^retry$/i)).toBeNull();
  });

  it('keeps the Refresh button in a normal session and clicking it calls refetch()', () => {
    deniabilityActive = false;
    setAvailableAnalyticsResult();
    render(<FeeAnalytics />);
    const btn = screen.getByText(/^refresh$/i);
    expect(btn).not.toBeNull();
    btn.click();
    expect(refetchSpy).toHaveBeenCalled();
  });

  it('keeps the Retry button in a normal session and clicking it calls refetch()', () => {
    deniabilityActive = false;
    setErrorResult();
    render(<FeeAnalytics />);
    const btn = screen.getByText(/^retry$/i);
    expect(btn).not.toBeNull();
    btn.click();
    expect(refetchSpy).toHaveBeenCalled();
  });
});
