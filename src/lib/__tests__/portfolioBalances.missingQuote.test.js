import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/wallet-core/evm/provider.js', () => ({ getBalanceEth: vi.fn() }));
vi.mock('@/wallet-core/evm/token-send.js', () => ({ getTokenBalance: vi.fn() }));
vi.mock('@/wallet-core/btc/provider.js', () => ({ getBalanceSats: vi.fn() }));
vi.mock('@/wallet-core/sol/provider.js', () => ({ getBalanceSol: vi.fn() }));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: vi.fn(() => false),
}));

import { getTokenBalance } from '@/wallet-core/evm/token-send.js';
import { computePortfolio, sumPortfolioTotal, usdRate } from '@/lib/portfolioBalances.js';
import { getAssetById } from '@/wallet-core/assets.js';
import { getCrypto } from '@/lib/cryptos.js';

const LINK = getAssetById('LINK:mainnet');

beforeEach(() => {
  vi.clearAllMocks();
  getTokenBalance.mockResolvedValue('2.5');
});

describe('portfolio missing-quote honesty', () => {
  it('keeps a positive real LINK receive-only balance unpriced and out of numeric totals', async () => {
    expect(LINK).toMatchObject({ status: 'receive_only', family: 'erc20', chain: 'mainnet' });
    const result = await computePortfolio(
      [{ id: 'w1', enabledAssets: [LINK.id] }],
      { w1: { evm: '0x1111111111111111111111111111111111111111' } },
    );

    const row = result.byWallet.w1.assets[0];
    expect(row).toMatchObject({
      id: LINK.id,
      symbol: LINK.symbol,
      amount: 2.5,
      usd: null,
      indeterminate: false,
      quoteUnavailable: true,
    });
    expect(result.byWallet.w1.total).toBe(0);
    expect(result.grandTotal).toBe(0);
    expect(result.assetTotals[LINK.id]).toMatchObject({ amount: 2.5, usd: null, quoteUnavailable: true });
    expect(result.priceBasis).toBe('unavailable');
  });

  it('keeps existing reference quotes and the stablecoin parity fallback', () => {
    expect(usdRate('ETH')).toBeGreaterThan(0);
    expect(usdRate('USDC')).toBe(1);
    expect(usdRate('USDT')).toBe(1);
    for (const symbol of ['LINK', 'UNI', 'SHIB', 'LEO']) {
      expect(getCrypto(symbol)).toMatchObject({ symbol, usd: null });
      expect(usdRate(symbol)).toBeNull();
    }
  });
});

describe('unpriced holdings mark the valuation incomplete without faking a failed read', () => {
  it('flags wallet, aggregate and summed totals as unpriced, distinct from indeterminate', async () => {
    const wallets = [{ id: 'w1', enabledAssets: [LINK.id] }];
    const result = await computePortfolio(wallets, { w1: { evm: '0x1111111111111111111111111111111111111111' } });
    expect(result.byWallet.w1.quoteUnavailable).toBe(true);
    expect(result.byWallet.w1.indeterminate).toBe(false);
    expect(result.quoteUnavailable).toBe(true);
    expect(result.indeterminate).toBe(false);
    expect(sumPortfolioTotal(wallets, result.byWallet)).toEqual({ total: 0, indeterminate: false, quoteUnavailable: true });
  });

  it('does not flag a confirmed zero balance', async () => {
    getTokenBalance.mockResolvedValue('0');
    const wallets = [{ id: 'w1', enabledAssets: [LINK.id] }];
    const result = await computePortfolio(wallets, { w1: { evm: '0x1111111111111111111111111111111111111111' } });
    expect(result.quoteUnavailable).toBe(false);
    expect(sumPortfolioTotal(wallets, result.byWallet).quoteUnavailable).toBe(false);
  });
});
