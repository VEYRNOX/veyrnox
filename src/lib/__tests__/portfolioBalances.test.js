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
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: vi.fn(() => false),
}));

import { getBalanceEth, getProvider } from '@/wallet-core/evm/provider.js';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';
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

describe('I3 zero-egress — ERC-20 balanceOf must not fire in a deniability session', () => {
  it('fetchAssetAmount throws (with I3 in the message) and never builds the RPC Contract', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    getProvider.mockClear();
    // getProvider(asset.chain) is the choke-point the erc20 branch calls to build
    // the ethers Contract before balanceOf — if the guard throws first it is never reached.
    const USDC = { symbol: 'USDC', family: 'erc20', chain: 'sepolia' };
    let threw = null;
    try {
      await fetchAssetAmount(USDC, { evm: '0xabc' });
    } catch (e) {
      threw = e;
    }
    expect(threw, 'erc20 balance read must THROW in a deniability session, not return 0/null').toBeTruthy();
    expect(String(threw?.message)).toMatch(/I3/);
    expect(getProvider).not.toHaveBeenCalled();
    isDeniabilitySessionActive.mockReturnValue(false);
  });
});

describe('I3 zero-egress — computePortfolio makes zero provider calls in a deniability session', () => {
  afterEach(() => isDeniabilitySessionActive.mockReturnValue(false));

  it('returns null without calling any balance provider', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    getBalanceEth.mockResolvedValue(9);
    const out = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }, { id: 'w2', enabledAssets: ['ETH', 'USDC'] }],
      { w1: { evm: '0xabc' }, w2: { evm: '0xdef' } },
    );
    expect(out).toBeNull();
    expect(getBalanceEth).not.toHaveBeenCalled();
  });
});

describe('live-price injection (optional, default-preserving)', () => {
  it('usdRate uses the live map when given, else falls back to USD_RATES', () => {
    const fallback = usdRate('ETH');               // existing one-arg behaviour
    expect(usdRate('ETH', { ETH: 4242 })).toBe(4242);
    expect(usdRate('ETH', {})).toBe(fallback);     // empty map → fallback
    expect(usdRate('ETH', undefined)).toBe(fallback);
  });

  it('computePortfolio applies the live map to USD when provided', async () => {
    getBalanceEth.mockResolvedValue(2);
    const live = { ETH: 1000 };
    const { byWallet, grandTotal } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }],
      { w1: { evm: '0xabc' } },
      live,
    );
    expect(byWallet.w1.assets[0].usd).toBe(2000); // 2 ETH * $1000 live
    expect(grandTotal).toBe(2000);
  });
});
