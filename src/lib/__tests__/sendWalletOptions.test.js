// Tests for the Send screen's "From Wallet" picker source-of-truth.
//
// REGRESSION: the picker used to read ONLY base44.entities.Wallet — a cache of
// public addresses written solely as a side effect of opening the HD Wallet
// Manager. A freshly created real wallet taken straight from the unlock gate to
// Send left that cache empty, so the picker had nothing to show and appeared
// inert (it "worked" in demo only because the demo pre-seeds Wallet entities).
// These tests pin the merged resolution: a real unlocked HD wallet always
// populates, the demo's seeded entities still back the picker, and a lone wallet
// auto-selects.

import { describe, it, expect } from 'vitest';
import {
  buildHdWalletOptions,
  resolveSendWallets,
  autoSelectWalletId,
  buildSendAssetOptions,
  resolveSelectedSendWallet,
} from '@/lib/sendWalletOptions';

const EVM_A = '0xAbC0000000000000000000000000000000000001';
const EVM_B = '0xDeF0000000000000000000000000000000000002';
const BTC_A = 'tb1qexampleexampleexampleexampleexampleex';
const SOL_A = 'So1anaExampleAddressExampleAddressExampl';

describe('buildHdWalletOptions — one sendable ETH option per HD wallet', () => {
  it('resolves each wallet to its primary EVM address with its custom name', () => {
    const hdWallets = [{ id: 'w-real', name: 'Al Jobson Wallet', backedUp: true }];
    const walletAddresses = { 'w-real': { evm: EVM_A, btc: 'tb1q…', sol: 'So1…' } };
    const opts = buildHdWalletOptions(hdWallets, walletAddresses);
    expect(opts).toEqual([
      { id: 'w-real', name: 'Al Jobson Wallet', currency: 'ETH', address: EVM_A, balance: 0 },
    ]);
  });

  it('drops a wallet whose EVM address has not derived yet (never a value-less item)', () => {
    const hdWallets = [
      { id: 'w1', name: 'One' },
      { id: 'w2', name: 'Two' },
    ];
    const walletAddresses = { w1: { evm: EVM_A } }; // w2 not derived
    const opts = buildHdWalletOptions(hdWallets, walletAddresses);
    expect(opts.map((o) => o.id)).toEqual(['w1']);
  });

  it('returns [] for an empty / locked session', () => {
    expect(buildHdWalletOptions([], {})).toEqual([]);
    expect(buildHdWalletOptions(undefined, undefined)).toEqual([]);
  });
});

describe('resolveSendWallets — authoritative HD session vs entity cache', () => {
  const hdOptions = [{ id: 'w-real', name: 'Al Jobson Wallet', currency: 'ETH', address: EVM_A, balance: 0 }];
  const entityWallets = [
    { id: 'w1', name: 'Main ETH', currency: 'ETH', address: EVM_B, balance: 2.4831 },
  ];

  it('a freshly created real wallet populates even when the entity cache is EMPTY', () => {
    const wallets = resolveSendWallets({ isUnlocked: true, hdOptions, entityWallets: [] });
    expect(wallets).toEqual(hdOptions); // the core bug: was [] before
  });

  it('prefers the unlocked HD session over a stale entity cache (correct names)', () => {
    const wallets = resolveSendWallets({ isUnlocked: true, hdOptions, entityWallets });
    expect(wallets).toBe(hdOptions);
  });

  it('falls back to the entity store for the demo tour (locked, pre-seeded)', () => {
    const wallets = resolveSendWallets({ isUnlocked: false, hdOptions: [], entityWallets });
    expect(wallets).toEqual(entityWallets);
  });

  it('falls back to the entity store while HD addresses are still deriving', () => {
    const wallets = resolveSendWallets({ isUnlocked: true, hdOptions: [], entityWallets });
    expect(wallets).toEqual(entityWallets);
  });
});

describe('autoSelectWalletId — pick the only wallet, never override a choice', () => {
  it('auto-selects when there is exactly one wallet', () => {
    expect(autoSelectWalletId([{ id: 'only' }], '')).toBe('only');
  });

  it('returns null with zero or multiple wallets (user must choose)', () => {
    expect(autoSelectWalletId([], '')).toBeNull();
    expect(autoSelectWalletId([{ id: 'a' }, { id: 'b' }], '')).toBeNull();
  });

  it('never overrides an explicit current selection', () => {
    expect(autoSelectWalletId([{ id: 'only' }], 'already-picked')).toBe('already-picked');
  });
});

describe('buildSendAssetOptions — the Send screen asset selector list', () => {
  const opts = buildSendAssetOptions();
  const bySymbol = Object.fromEntries(opts.map((o) => [o.symbol, o]));

  it('offers one entry per asset, in registry order with ETH first', () => {
    expect(opts.map((o) => o.symbol)).toEqual([
      'ETH', 'USDC', 'USDT', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB', 'BTC', 'SOL',
    ]);
  });

  it('carries the display symbol, name and family for each asset', () => {
    expect(bySymbol.ETH).toMatchObject({ symbol: 'ETH', name: 'Ethereum', family: 'evm' });
    expect(bySymbol.USDC).toMatchObject({ symbol: 'USDC', name: 'USD Coin', family: 'erc20' });
  });

  it('enables every EVM + ERC-20 asset (chain/address/balance/signing all flow from currency)', () => {
    for (const s of ['ETH', 'USDC', 'USDT', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB']) {
      expect(bySymbol[s].disabled).toBe(false);
    }
  });

  it('shows BTC and SOL disabled / "coming soon" — no non-EVM dispatch on the Send screen', () => {
    expect(bySymbol.BTC.disabled).toBe(true);
    expect(bySymbol.SOL.disabled).toBe(true);
  });
});

describe('resolveSelectedSendWallet — fold the chosen asset onto the chosen HD wallet', () => {
  const walletPick = { id: 'w-real', name: 'Al Jobson Wallet', currency: 'ETH', address: EVM_A, balance: 0 };
  const walletAddresses = { 'w-real': { evm: EVM_A, btc: BTC_A, sol: SOL_A } };

  it('an EVM native asset resolves to the wallet\'s shared EVM address', () => {
    const sel = resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'MATIC', walletAddresses });
    expect(sel).toEqual({ id: 'w-real', name: 'Al Jobson Wallet', currency: 'MATIC', address: EVM_A, balance: 0 });
  });

  it('an ERC-20 asset shares the SAME EVM address (contract call on that address)', () => {
    const sel = resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'USDC', walletAddresses });
    expect(sel).toMatchObject({ currency: 'USDC', address: EVM_A });
  });

  it('BTC resolves to the wallet\'s bech32 address; SOL to its ed25519 address', () => {
    expect(resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'BTC', walletAddresses }))
      .toMatchObject({ currency: 'BTC', address: BTC_A });
    expect(resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'SOL', walletAddresses }))
      .toMatchObject({ currency: 'SOL', address: SOL_A });
  });

  it('returns null for an unknown asset symbol', () => {
    expect(resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'DOGE', walletAddresses })).toBeNull();
  });

  it('returns the currency with an undefined address while that family has not derived yet', () => {
    const sel = resolveSelectedSendWallet({ isAssetMode: true, walletPick, assetSymbol: 'ETH', walletAddresses: {} });
    expect(sel).toMatchObject({ currency: 'ETH', address: undefined });
  });

  it('in demo (non-asset mode) returns the picked row unchanged — its own currency/address/balance', () => {
    const demoRow = { id: 'w1', name: 'Main BTC', currency: 'BTC', address: BTC_A, balance: 0.5 };
    expect(resolveSelectedSendWallet({ isAssetMode: false, walletPick: demoRow, assetSymbol: 'ETH', walletAddresses }))
      .toBe(demoRow);
  });

  it('returns null when no wallet is picked', () => {
    expect(resolveSelectedSendWallet({ isAssetMode: true, walletPick: null, assetSymbol: 'ETH', walletAddresses })).toBeNull();
  });
});
