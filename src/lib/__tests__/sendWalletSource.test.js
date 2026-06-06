// Tests for the Send-screen wallet-source adapter.
//
// REGRESSION CONTEXT: the Send screen read wallets from base44.entities.Wallet.list()
// — the DEMO data layer, which is EMPTY in a live build — so its "From Wallet"
// dropdown was blank even though the dashboard (which reads the live vault via
// useWallet) showed Wallet 1 fine. These helpers bind Send to the SAME source and
// adapt the multi-asset vault wallet (a SEED with enabledAssets) to the per-(wallet,
// asset) record the Send flow consumes.

import { describe, it, expect } from 'vitest';
import {
  defaultWalletId,
  walletAssetSymbols,
  defaultAssetSymbol,
  buildSendWallet,
} from '@/lib/sendWalletSource';

// Distinct, format-plausible addresses so a chain mix-up would be caught.
const EVM = '0xAbC0000000000000000000000000000000000001';
const BTC = 'tb1qexampleexampleexampleexampleexampleq8n2';
const SOL = 'So1anaBase58AddrExampleExampleExampleExampl';
const derived = { accounts: [{ address: EVM, index: 0 }], btcAccount: { address: BTC }, solAccount: { address: SOL } };

const wallets = [
  { id: 'w1', name: 'Wallet 1', backedUp: true, enabledAssets: ['ETH', 'USDC', 'USDT', 'BTC', 'SOL'] },
  { id: 'w2', name: 'Savings', backedUp: false, enabledAssets: ['ETH', 'BTC'] },
];

describe('sendWalletSource — binding Send to the live vault source', () => {
  describe('defaultWalletId', () => {
    it('returns the active wallet when it is present', () => {
      expect(defaultWalletId(wallets, 'w2')).toBe('w2');
    });
    it('falls back to the first wallet when active is missing/stale', () => {
      expect(defaultWalletId(wallets, 'gone')).toBe('w1');
      expect(defaultWalletId(wallets, null)).toBe('w1');
    });
    it('single wallet → that wallet (the auto-select case)', () => {
      expect(defaultWalletId([wallets[0]], null)).toBe('w1');
    });
    it('returns "" when there are no wallets (locked / explore)', () => {
      expect(defaultWalletId([], 'w1')).toBe('');
      expect(defaultWalletId(undefined, null)).toBe('');
    });
  });

  describe('walletAssetSymbols', () => {
    it('returns the selected wallet\'s enabledAssets (same list the dashboard shows)', () => {
      expect(walletAssetSymbols(wallets, 'w2')).toEqual(['ETH', 'BTC']);
    });
    it('empty for an unknown wallet id', () => {
      expect(walletAssetSymbols(wallets, 'nope')).toEqual([]);
      expect(walletAssetSymbols(undefined, 'w1')).toEqual([]);
    });
  });

  describe('defaultAssetSymbol', () => {
    it('keeps the current pick when it is still enabled', () => {
      expect(defaultAssetSymbol(['ETH', 'BTC'], 'BTC')).toBe('BTC');
    });
    it('prefers ETH (the one live/sendable asset) when the current pick is gone', () => {
      expect(defaultAssetSymbol(['ETH', 'BTC'], 'SOL')).toBe('ETH');
      expect(defaultAssetSymbol(['ETH', 'BTC'], null)).toBe('ETH');
    });
    it('falls back to the first asset when ETH is not shown', () => {
      expect(defaultAssetSymbol(['BTC', 'SOL'], null)).toBe('BTC');
    });
    it('"" for an empty asset list', () => {
      expect(defaultAssetSymbol([], null)).toBe('');
      expect(defaultAssetSymbol(undefined, 'ETH')).toBe('');
    });
  });

  describe('buildSendWallet', () => {
    it('null until BOTH a wallet and an asset are chosen', () => {
      expect(buildSendWallet({ wallets, walletId: '', assetSymbol: 'ETH', ...derived })).toBeNull();
      expect(buildSendWallet({ wallets, walletId: 'w1', assetSymbol: '', ...derived })).toBeNull();
    });
    it('ETH → shared EVM address; currency mirrors the chosen asset', () => {
      const s = buildSendWallet({ wallets, walletId: 'w1', assetSymbol: 'ETH', ...derived });
      expect(s).toMatchObject({ id: 'w1', name: 'Wallet 1', currency: 'ETH', address: EVM, balance: 0 });
    });
    it('BTC → bech32 address, NOT the EVM one', () => {
      const s = buildSendWallet({ wallets, walletId: 'w1', assetSymbol: 'BTC', ...derived });
      expect(s.address).toBe(BTC);
      expect(s.currency).toBe('BTC');
    });
    it('SOL → base58 address', () => {
      const s = buildSendWallet({ wallets, walletId: 'w1', assetSymbol: 'SOL', ...derived });
      expect(s.address).toBe(SOL);
    });
    it('USDC (ERC-20) → shared EVM address', () => {
      const s = buildSendWallet({ wallets, walletId: 'w1', assetSymbol: 'USDC', ...derived });
      expect(s.address).toBe(EVM);
    });
    it('locked (no derived accounts) → record still built, address null', () => {
      const s = buildSendWallet({ wallets, walletId: 'w1', assetSymbol: 'ETH', accounts: [], btcAccount: null, solAccount: null });
      expect(s.address).toBeNull();
      expect(s.currency).toBe('ETH');
    });
    it('unknown wallet id → null', () => {
      expect(buildSendWallet({ wallets, walletId: 'nope', assetSymbol: 'ETH', ...derived })).toBeNull();
    });
  });
});
