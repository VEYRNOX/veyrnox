import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SPAM_TOKEN_OVERRIDES_KEY,
  buildAssetSpamIntel,
  clearSpamTokenOverride,
  readSpamTokenOverrides,
  setSpamTokenOverride,
} from '@/lib/spamTokenIntel';

describe('spamTokenIntel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('matches symbol clones and classifies suspicious copies only', () => {
    const intel = buildAssetSpamIntel([
      { id: 'real', symbol: 'USDC', name: 'USD Coin', value_usd: 100, balance: 100, acquired_via: 'purchase', verified: true },
      { id: 'clone', symbol: 'USDC', name: 'USDC-Rewards.com', value_usd: 0, balance: 5000, acquired_via: 'airdrop', verified: false },
      { id: 'other', symbol: 'WETH', name: 'Wrapped Ether', value_usd: 50, balance: 1, acquired_via: 'purchase', verified: true },
    ], 'usdc');

    expect(intel.total).toBe(2);
    expect(intel.flaggedCount).toBe(1);
    expect(intel.hiddenCount).toBe(1);
    expect(intel.visibleCount).toBe(0);
    expect(intel.flagged[0].id).toBe('clone');
  });

  it('respects local hide/show overrides', () => {
    const rows = [
      { id: 'clone', symbol: 'USDC', name: 'USDC-Rewards.com', value_usd: 0, balance: 5000, acquired_via: 'airdrop', verified: false },
    ];

    setSpamTokenOverride('clone', 'show');
    let intel = buildAssetSpamIntel(rows, 'USDC', readSpamTokenOverrides());
    expect(intel.hiddenCount).toBe(0);
    expect(intel.visibleCount).toBe(1);
    expect(intel.tokens[0].hidden).toBe(false);

    setSpamTokenOverride('clone', 'hide');
    intel = buildAssetSpamIntel(rows, 'USDC', readSpamTokenOverrides());
    expect(intel.hiddenCount).toBe(1);
    expect(intel.visibleCount).toBe(0);
    expect(intel.tokens[0].hidden).toBe(true);
  });

  it('clears per-token overrides without touching others', () => {
    setSpamTokenOverride('a', 'hide');
    setSpamTokenOverride('b', 'show');

    clearSpamTokenOverride('a');

    expect(readSpamTokenOverrides()).toEqual({ b: 'show' });
    expect(JSON.parse(localStorage.getItem(SPAM_TOKEN_OVERRIDES_KEY))).toEqual({ b: 'show' });
  });
});
