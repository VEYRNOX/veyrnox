// The home Analytics distribution chart was handed HD wallet records (no
// `currency` / `balance`) and re-priced them through the static USD_RATES
// table, so for real users it always rendered "No assets to display". It now
// takes slices derived from the SAME usd values the portfolio total sums.
import { describe, it, expect } from 'vitest';
import { assetDistribution } from '../portfolioBalances';

const byWallet = {
  w1: {
    total: 0,
    assets: [
      { id: 'BTC:mainnet', symbol: 'BTC', amount: 0.5, usd: 50000 },
      { id: 'ETH:mainnet', symbol: 'ETH', amount: 1, usd: 4000 },
      { id: 'ARB:arbitrum', symbol: 'ARB', amount: 0.5, usd: 2000 },
      { id: 'SOL:mainnet', symbol: 'SOL', amount: 0, usd: 0 },
    ],
  },
  w2: {
    total: 0,
    assets: [
      { id: 'BTC:mainnet', symbol: 'BTC', amount: 0.1, usd: 10000 },
      { id: 'ETH:mainnet', symbol: 'ETH', amount: null, usd: null, indeterminate: true },
    ],
  },
  other: { total: 0, assets: [{ id: 'SOL:mainnet', symbol: 'SOL', amount: 9, usd: 999 }] },
};

describe('assetDistribution', () => {
  it('sums the portfolio usd values per display symbol, largest first', () => {
    const out = assetDistribution([{ id: 'w1' }, { id: 'w2' }], byWallet);
    // ARB is native ETH on Arbitrum (displaySymbol ETH) so it merges into ETH.
    expect(out).toEqual([
      { name: 'BTC', usd: 60000 },
      { name: 'ETH', usd: 6000 },
    ]);
  });

  it('only counts the wallets it is given (active portfolio), and skips failed reads and zero rows', () => {
    const out = assetDistribution([{ id: 'w2' }], byWallet);
    expect(out).toEqual([{ name: 'BTC', usd: 10000 }]);
  });

  it('returns [] before the portfolio has loaded', () => {
    expect(assetDistribution([{ id: 'w1' }], {})).toEqual([]);
    expect(assetDistribution([], byWallet)).toEqual([]);
  });
});
