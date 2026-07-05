// src/lib/__tests__/priceFeed.i3guard.test.js
//
// I3-1 (2026-07-04 internal audit): fetchLivePricesUsd() is a pure-export callable
// with no I3 guard. In a deniability session it must make ZERO egress — the function
// itself must fail closed (throw) rather than rely solely on the hook's enabled gate,
// because it is directly importable/callable. This pins the runtime guard.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/coinGecko.js', () => ({
  fetchPortfolioPricesUsdCG: vi.fn(async () => ({ BTC: 1, ETH: 2 })),
}));

import { fetchPortfolioPricesUsdCG } from '@/lib/coinGecko.js';
import { fetchLivePricesUsd } from '../priceFeed.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

describe('fetchLivePricesUsd — I3 runtime guard (fail closed)', () => {
  beforeEach(() => {
    setDeniabilitySession(false);
    fetchPortfolioPricesUsdCG.mockClear();
  });

  it('throws and makes no egress when a deniability session is active', async () => {
    setDeniabilitySession(true);
    await expect(fetchLivePricesUsd()).rejects.toThrow(/I3/);
    expect(fetchPortfolioPricesUsdCG).not.toHaveBeenCalled();
    setDeniabilitySession(false);
  });

  it('fetches normally when no deniability session is active', async () => {
    const out = await fetchLivePricesUsd();
    expect(fetchPortfolioPricesUsdCG).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ BTC: 1, ETH: 2 });
  });
});
