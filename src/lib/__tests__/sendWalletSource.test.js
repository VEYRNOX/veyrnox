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
  demoSendSource,
  DEMO_SEND_WALLET_ID,
} from '@/lib/sendWalletSource';
import { DEFAULT_ENABLED_ASSETS } from '@/lib/walletMeta';

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

  // REGRESSION (demo): #127 bound Send to the live useWallet() source, which is
  // EMPTY in demo (no unlocked vault) — so both pickers were blank and the Asset
  // bottom-sheet opened with zero options. demoSendSource() repopulates the demo
  // form from a synthetic multi-asset wallet so an asset can be picked again.
  describe('demoSendSource — repopulates the demo Send form', () => {
    it('exposes a single multi-asset wallet with the default enabled assets', () => {
      const { wallets: w } = demoSendSource();
      expect(w).toHaveLength(1);
      expect(w[0].id).toBe(DEMO_SEND_WALLET_ID);
      expect(w[0].enabledAssets).toEqual([...DEFAULT_ENABLED_ASSETS]);
    });

    it('its wallet flows through the existing helpers (asset list, default, default wallet)', () => {
      const src = demoSendSource();
      expect(defaultWalletId(src.wallets, '')).toBe(DEMO_SEND_WALLET_ID);
      expect(walletAssetSymbols(src.wallets, DEMO_SEND_WALLET_ID)).toContain('ETH');
      // ETH is enabled, so the auto-pick prefers it (the one sendable asset).
      expect(defaultAssetSymbol(walletAssetSymbols(src.wallets, DEMO_SEND_WALLET_ID), '')).toBe('ETH');
    });

    it('buildSendWallet resolves the per-chain demo address from the demo accounts', () => {
      const src = demoSendSource();
      const eth = buildSendWallet({ wallets: src.wallets, walletId: DEMO_SEND_WALLET_ID, assetSymbol: 'ETH', accounts: src.accounts, btcAccount: src.btcAccount, solAccount: src.solAccount });
      expect(eth.address).toBe(src.accounts[0].address);
      const btc = buildSendWallet({ wallets: src.wallets, walletId: DEMO_SEND_WALLET_ID, assetSymbol: 'BTC', accounts: src.accounts, btcAccount: src.btcAccount, solAccount: src.solAccount });
      expect(btc.address).toBe(src.btcAccount.address);
      // EVM and BTC addresses must NOT collide (a chain mix-up loses funds).
      expect(btc.address).not.toBe(eth.address);
    });

    it('carries a demo balance for ETH (drives the demo balance display / max check)', () => {
      expect(demoSendSource().balances.ETH).toBeGreaterThan(0);
    });
  });
});
