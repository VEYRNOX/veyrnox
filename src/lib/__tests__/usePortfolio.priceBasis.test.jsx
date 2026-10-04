// @ts-nocheck
// usePortfolio's price-basis label (I4): "Live" only when the figures on screen
// were priced live AND live prices are available now. A hydrated cache entry or
// a live-priced placeholder must never keep a "Live" label on its own.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/wallet-core/evm/provider.js', () => ({ getBalanceEth: vi.fn(), getProvider: vi.fn(() => ({})) }));
vi.mock('@/wallet-core/evm/tokens.js', () => ({ getToken: vi.fn(() => ({ address: '0xtoken', decimals: 6 })), ERC20_ABI: [] }));
vi.mock('@/wallet-core/btc/provider.js', () => ({ getBalanceSats: vi.fn() }));
vi.mock('@/wallet-core/sol/provider.js', () => ({ getBalanceSol: vi.fn() }));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({ isDeniabilitySessionActive: vi.fn(() => false) }));
vi.mock('@/lib/priceFeed.js', () => ({ useLivePrices: vi.fn() }));
vi.mock('@/lib/portfolioCacheStore.js', () => ({ loadPortfolioCache: vi.fn(), savePortfolioCache: vi.fn() }));

import { getBalanceEth } from '@/wallet-core/evm/provider.js';
import { useLivePrices } from '@/lib/priceFeed.js';
import { loadPortfolioCache } from '@/lib/portfolioCacheStore.js';
import { usePortfolio } from '@/lib/portfolioBalances.js';

const WALLETS = [{ id: 'w1', enabledAssets: ['ETH'] }];
const ADDRS = { w1: { evm: '0xabc' } };
const LIVE_RESULT = {
  byWallet: { w1: { assets: [], total: 2000, indeterminate: false } },
  grandTotal: 2000, assetTotals: {}, indeterminate: false,
  priceBasis: 'live', pricesUpdatedAt: 111,
};
const pending = () => new Promise(() => {});
const livePrices = (over = {}) => ({ prices: { ETH: 1000 }, isError: false, updatedAt: 500, refetch: vi.fn(), ...over });
const noPrices = (over = {}) => ({ prices: null, isError: false, updatedAt: null, refetch: vi.fn(), ...over });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => usePortfolio(WALLETS, ADDRS), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  loadPortfolioCache.mockReturnValue(undefined);
});

describe('usePortfolio price basis', () => {
  it('a cache entry saved as live hydrates as approximate, even with live prices available', () => {
    loadPortfolioCache.mockReturnValue({ ts: Date.now(), data: LIVE_RESULT });
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockImplementation(pending); // the fresh compute never lands
    const { result } = setup();
    expect(result.current.data.grandTotal).toBe(2000); // cached figures still render
    expect(result.current.priceBasis).toBe('approx');
    expect(result.current.pricesUpdatedAt).toBeNull();
  });

  it('recomputes a freshly written cache entry on the first session render', async () => {
    loadPortfolioCache.mockReturnValue({ ts: Date.now(), data: LIVE_RESULT });
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockResolvedValue(3);
    const { result } = setup();

    expect(result.current.data.grandTotal).toBe(2000);
    expect(result.current.priceBasis).toBe('approx');
    await waitFor(() => expect(result.current.data.grandTotal).toBe(3000));
    expect(getBalanceEth).toHaveBeenCalled();
    expect(result.current.priceBasis).toBe('live');
  });

  it('a legacy cache entry with no provenance is approximate', () => {
    const { priceBasis: _b, pricesUpdatedAt: _t, ...legacy } = LIVE_RESULT;
    loadPortfolioCache.mockReturnValue({ ts: Date.now(), data: legacy });
    useLivePrices.mockReturnValue(noPrices());
    getBalanceEth.mockImplementation(pending);
    const { result } = setup();
    expect(result.current.priceBasis).toBe('approx');
  });

  it('a fresh live compute is labelled live with the price fetch time', async () => {
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockResolvedValue(2);
    const { result } = setup();
    await waitFor(() => expect(result.current.priceBasis).toBe('live'));
    expect(result.current.pricesUpdatedAt).toBe(500);
    expect(result.current.data.grandTotal).toBe(2000);
  });

  it('opting out drops the label at once, while live-priced figures are still on screen', async () => {
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockResolvedValue(2);
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.priceBasis).toBe('live'));

    getBalanceEth.mockImplementation(pending); // the approx recompute has not landed
    useLivePrices.mockReturnValue(noPrices());
    rerender();
    expect(result.current.data.priceBasis).toBe('live'); // placeholder is the live result
    expect(result.current.priceBasis).toBe('approx');
    expect(result.current.pricesUpdatedAt).toBeNull();
  });

  it('a price error drops the label too', async () => {
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockResolvedValue(2);
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.priceBasis).toBe('live'));
    getBalanceEth.mockImplementation(pending);
    useLivePrices.mockReturnValue(livePrices({ isError: true }));
    rerender();
    expect(result.current.priceBasis).toBe('approx');
  });

  it('manual refresh re-prices the portfolio with the new prices and moves the stamp', async () => {
    const refetch = vi.fn().mockResolvedValue({ isError: false });
    useLivePrices.mockReturnValue(livePrices({ refetch }));
    getBalanceEth.mockResolvedValue(2);
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.pricesUpdatedAt).toBe(500));

    await act(async () => { await result.current.refetchPrices(); });
    expect(refetch).toHaveBeenCalledTimes(1);
    useLivePrices.mockReturnValue(livePrices({ prices: { ETH: 1500 }, updatedAt: 900, refetch }));
    rerender();
    await waitFor(() => expect(result.current.pricesUpdatedAt).toBe(900));
    expect(result.current.data.grandTotal).toBe(3000);
    expect(result.current.priceBasis).toBe('live');
  });

  it('a new price timestamp alone (no manual refresh) does not refetch balances', async () => {
    useLivePrices.mockReturnValue(livePrices());
    getBalanceEth.mockResolvedValue(2);
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.pricesUpdatedAt).toBe(500));
    const calls = getBalanceEth.mock.calls.length;
    useLivePrices.mockReturnValue(livePrices({ updatedAt: 900 }));
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(getBalanceEth.mock.calls.length).toBe(calls);
  });
});
