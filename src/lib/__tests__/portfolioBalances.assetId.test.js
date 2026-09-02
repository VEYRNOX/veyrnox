// src/lib/__tests__/portfolioBalances.assetId.test.js
//
// Phase 1a of per-chain expansion (docs/per-chain-expansion-scope.md): storage
// moves from symbol-only to composite "{symbol}:{chain}" ids. computePortfolio
// must accept BOTH a legacy-symbol wallet (not yet migrated) and an
// id-migrated wallet, resolve the same underlying asset either way, and emit
// rows carrying BOTH `id` and `symbol` so downstream readers can migrate
// lazily (balanceDisplay.resolveAssetRow matches on id first, symbol second).
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { getBalanceEth } from '@/wallet-core/evm/provider.js';
import { computePortfolio } from '@/lib/portfolioBalances.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computePortfolio — Phase 1a composite-id tolerance', () => {
  it('resolves a legacy-symbol wallet ("ETH") the same as an id-migrated one ("ETH:mainnet")', async () => {
    getBalanceEth.mockResolvedValue(3);
    const legacy = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }],
      { w1: { evm: '0xabc' } },
    );
    const migrated = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH:mainnet'] }],
      { w1: { evm: '0xabc' } },
    );
    expect(legacy.grandTotal).toBe(migrated.grandTotal);
    expect(legacy.byWallet.w1.assets[0].symbol).toBe('ETH');
    expect(migrated.byWallet.w1.assets[0].symbol).toBe('ETH');
  });

  it('emits rows carrying BOTH id and symbol', async () => {
    getBalanceEth.mockResolvedValue(1);
    const { byWallet } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH:mainnet'] }],
      { w1: { evm: '0xabc' } },
    );
    const row = byWallet.w1.assets[0];
    expect(row.id).toBe('ETH:mainnet');
    expect(row.symbol).toBe('ETH');
  });

  it('a wallet mixing a legacy symbol and a composite id resolves both', async () => {
    getBalanceEth.mockResolvedValue(2);
    const { byWallet } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH', 'ETH:mainnet'] }],
      { w1: { evm: '0xabc' } },
    );
    // Both entries resolve to the same underlying ETH asset.
    expect(byWallet.w1.assets).toHaveLength(2);
    expect(byWallet.w1.assets.every((a) => a.symbol === 'ETH' && a.id === 'ETH:mainnet')).toBe(true);
  });

  it('an unknown id/symbol is silently skipped, not thrown (fail-honest)', async () => {
    getBalanceEth.mockResolvedValue(1);
    const { byWallet } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['NOT_A_REAL_ASSET', 'ETH:mainnet'] }],
      { w1: { evm: '0xabc' } },
    );
    expect(byWallet.w1.assets).toHaveLength(1);
    expect(byWallet.w1.assets[0].id).toBe('ETH:mainnet');
  });
});
