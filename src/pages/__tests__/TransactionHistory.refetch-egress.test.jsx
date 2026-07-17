// @ts-nocheck
// src/pages/__tests__/TransactionHistory.refetch-egress.test.jsx
//
// I3 deniability guard (issue #1121) — pre-existing instance of the react-query
// v5 refetch()-bypasses-`enabled` bug class (previously fixed for GasTracker,
// issue #1095, PR #1118; original bug class PRs #614/#925). TransactionHistory's
// `enabled: egressAllowed` gate stops the automatic query, but its Retry
// (error state) and Refresh (footer) buttons both called `refetch()` directly,
// unconditionally — a decoy/hidden session with stale cached data (or a
// session flip mid-mount) could still fire the live address->indexer
// disclosure by tapping either button.
//
// Fix: hide (not disable) both buttons when `egressAllowed` is false, matching
// GasTracker's pattern. useQuery itself is mocked so each render can force the
// isError and data-loaded branches directly, independent of the real
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

let TransactionHistory;
beforeEach(async () => {
  deniabilityActive = false;
  refetchSpy.mockClear();
  vi.resetModules();
  ({ default: TransactionHistory } = await import('@/pages/TransactionHistory'));
});
afterEach(() => {
  cleanup();
});

function setLoadedTxsResult() {
  queryResult = {
    data: {
      supported: true,
      source: { networkName: 'Ethereum', privacyNote: 'note' },
      transactions: [{ id: '1', type: 'send', status: 'confirmed', amount: '0.1', assetSymbol: 'ETH', counterparty: '0xdef' }],
    },
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

describe('TransactionHistory — I3 refetch() trigger (behavioral, #1121)', () => {
  it('hides the Refresh button (footer, data-loaded state) in a deniability session', () => {
    deniabilityActive = true;
    setLoadedTxsResult();
    render(<TransactionHistory />);
    expect(screen.queryByText(/^refresh$/i)).toBeNull();
  });

  it('hides the Retry button (error state) in a deniability session', () => {
    deniabilityActive = true;
    setErrorResult();
    render(<TransactionHistory />);
    expect(screen.queryByText(/^retry$/i)).toBeNull();
  });

  it('keeps the Refresh button in a normal session and clicking it calls refetch()', () => {
    deniabilityActive = false;
    setLoadedTxsResult();
    render(<TransactionHistory />);
    const btn = screen.getByText(/^refresh$/i);
    expect(btn).not.toBeNull();
    btn.click();
    expect(refetchSpy).toHaveBeenCalled();
  });

  it('keeps the Retry button in a normal session and clicking it calls refetch()', () => {
    deniabilityActive = false;
    setErrorResult();
    render(<TransactionHistory />);
    const btn = screen.getByText(/^retry$/i);
    expect(btn).not.toBeNull();
    btn.click();
    expect(refetchSpy).toHaveBeenCalled();
  });
});
