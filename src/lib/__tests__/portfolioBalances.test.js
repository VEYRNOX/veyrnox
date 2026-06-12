// src/lib/__tests__/portfolioBalances.test.js
//
// Portfolio aggregation invariants (reconciliation brief, Findings 1 & 2):
//   - Finding 2 (I4 fail-CLOSED): a FAILED balance read is `indeterminate`, never
//     folded into a silent `0`. `0` means "read OK, empty"; `null` means "read
//     failed". The total stops claiming completeness when any read is indeterminate.
//   - Finding 1 (I3 seal): computePortfolio reads ONLY the addresses handed to it,
//     so a decoy session's portfolio path can never reach a real-set address.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every per-chain provider so the aggregation logic is exercised in isolation.
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getBalanceEth: vi.fn(),
  getProvider: vi.fn(() => ({})),
}));
vi.mock('@/wallet-core/evm/tokens.js', () => ({
  getToken: vi.fn(() => ({ address: '0xtoken', decimals: 6 })),
  ERC20_ABI: [],
}));
vi.mock('@/wallet-core/btc/provider.js', () => ({ getBalanceSats: vi.fn() }));
vi.mock('@/wallet-core/sol/provider.js', () => ({ getBalanceSol: vi.fn() }));

import { getBalanceEth } from '@/wallet-core/evm/provider.js';
import { getBalanceSats } from '@/wallet-core/btc/provider.js';
import { getBalanceSol } from '@/wallet-core/sol/provider.js';
import {
  fetchAssetAmount,
  computePortfolio,
  sumPortfolioTotal,
} from '@/lib/portfolioBalances.js';
import { usdRate } from '@/lib/portfolioBalances.js';

const ETH = { symbol: 'ETH', family: 'evm', chain: 'sepolia' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAssetAmount — indeterminate vs zero (Finding 2)', () => {
  it('returns null (indeterminate) when the provider read throws', async () => {
    getBalanceEth.mockRejectedValueOnce(new Error('RPC down'));
    const amount = await fetchAssetAmount(ETH, { evm: '0xabc' });
    expect(amount).toBeNull();
  });

  it('returns the number (incl. a genuine 0) when the read succeeds', async () => {
    getBalanceEth.mockResolvedValueOnce(0);
    expect(await fetchAssetAmount(ETH, { evm: '0xabc' })).toBe(0);
    getBalanceEth.mockResolvedValueOnce(5);
    expect(await fetchAssetAmount(ETH, { evm: '0xabc' })).toBe(5);
  });

  it('treats a missing address as a genuine 0, not a read failure', async () => {
    const amount = await fetchAssetAmount(ETH, {}); // no evm address derived
    expect(amount).toBe(0);
    expect(getBalanceEth).not.toHaveBeenCalled();
  });

  it('propagates indeterminate for btc and sol read failures too', async () => {
    getBalanceSats.mockRejectedValueOnce(new Error('esplora down'));
    expect(await fetchAssetAmount({ symbol: 'BTC', family: 'btc', chain: 'testnet' }, { btc: 'tb1q' })).toBeNull();
    getBalanceSol.mockRejectedValueOnce(new Error('rpc down'));
    expect(await fetchAssetAmount({ symbol: 'SOL', family: 'solana', chain: 'devnet' }, { sol: 'So11' })).toBeNull();
  });
});

describe('computePortfolio — indeterminate propagation (Finding 2)', () => {
  it('marks a failed asset row indeterminate and bubbles it to wallet + grand total', async () => {
    getBalanceEth.mockRejectedValue(new Error('RPC down'));
    const { byWallet, grandTotal, indeterminate } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }],
      { w1: { evm: '0xabc' } },
    );
    const row = byWallet.w1.assets.find((a) => a.symbol === 'ETH');
    expect(row.indeterminate).toBe(true);
    expect(row.amount).toBeNull();
    expect(row.usd).toBeNull();
    expect(byWallet.w1.indeterminate).toBe(true);
    expect(indeterminate).toBe(true);
    // A failed read must NOT masquerade as $0.
    expect(grandTotal).toBe(0); // nothing readable contributed
  });

  it('keeps healthy wallets summing while another is indeterminate', async () => {
    getBalanceEth.mockImplementation(async (_chain, addr) => {
      if (addr === '0xGOOD') return 2;
      throw new Error('RPC down');
    });
    const { byWallet, grandTotal, indeterminate } = await computePortfolio(
      [
        { id: 'good', enabledAssets: ['ETH'] },
        { id: 'bad', enabledAssets: ['ETH'] },
      ],
      { good: { evm: '0xGOOD' }, bad: { evm: '0xBAD' } },
    );
    expect(byWallet.good.indeterminate).toBe(false);
    expect(byWallet.good.total).toBeCloseTo(2 * usdRate('ETH'));
    expect(byWallet.bad.indeterminate).toBe(true);
    expect(indeterminate).toBe(true);
    // Grand total reflects only what was readable — the healthy wallet's value.
    expect(grandTotal).toBeCloseTo(2 * usdRate('ETH'));
  });

  it('reports indeterminate=false when every read succeeds', async () => {
    getBalanceEth.mockResolvedValue(1);
    const { indeterminate, byWallet } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }],
      { w1: { evm: '0xabc' } },
    );
    expect(indeterminate).toBe(false);
    expect(byWallet.w1.indeterminate).toBe(false);
  });
});

describe('sumPortfolioTotal — fail-closed total helper (Findings 2 & 3)', () => {
  it('sums healthy wallet totals and flags incompleteness when any is indeterminate', () => {
    const byWallet = {
      a: { total: 10, indeterminate: false },
      b: { total: 0, indeterminate: true },
    };
    const pfWallets = [{ id: 'a' }, { id: 'b' }];
    const { total, indeterminate } = sumPortfolioTotal(pfWallets, byWallet);
    expect(total).toBe(10);
    expect(indeterminate).toBe(true);
  });

  it('is complete (indeterminate=false) when all included wallets read OK', () => {
    const byWallet = { a: { total: 4, indeterminate: false }, b: { total: 6, indeterminate: false } };
    const { total, indeterminate } = sumPortfolioTotal([{ id: 'a' }, { id: 'b' }], byWallet);
    expect(total).toBe(10);
    expect(indeterminate).toBe(false);
  });

  it('takes no session context — identical inputs give identical output (decoy === real, Finding 3)', () => {
    const byWallet = { a: { total: 7, indeterminate: false } };
    const pf = [{ id: 'a' }];
    expect(sumPortfolioTotal(pf, byWallet)).toEqual(sumPortfolioTotal(pf, byWallet));
    // The helper signature carries no isDecoy/isHidden parameter by construction.
    expect(sumPortfolioTotal.length).toBe(2);
  });
});

describe('computePortfolio — I3 seal (Finding 1)', () => {
  it('queries ONLY the addresses it was handed — never reaches outside its inputs', async () => {
    const queried = [];
    getBalanceEth.mockImplementation(async (_chain, addr) => {
      queried.push(addr);
      return 1;
    });
    // A decoy session would pass only decoy-set wallets + addresses.
    await computePortfolio(
      [{ id: 'decoy1', enabledAssets: ['ETH'] }],
      { decoy1: { evm: '0xDECOYONLY' } },
    );
    expect(queried).toEqual(['0xDECOYONLY']);
    // No real-set address is reachable: the only address source is the argument.
    expect(queried.every((a) => a === '0xDECOYONLY')).toBe(true);
  });
});
