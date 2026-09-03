// lib/__tests__/assetLabel.test.js
import { describe, it, expect } from 'vitest';
import { assetDisplaySymbol, assetChainLabel, assetDisplayLabel } from '../assetLabel.js';
import { getAsset } from '@/wallet-core/assets.js';

describe('assetDisplaySymbol', () => {
  it('returns displaySymbol when set (POL for MATIC, ETH for ARB/OP)', () => {
    expect(assetDisplaySymbol(getAsset('MATIC'))).toBe('POL');
    expect(assetDisplaySymbol(getAsset('ARB'))).toBe('ETH');
    expect(assetDisplaySymbol(getAsset('OP'))).toBe('ETH');
  });

  it('falls back to symbol when displaySymbol is absent', () => {
    expect(assetDisplaySymbol(getAsset('ETH'))).toBe('ETH');
    expect(assetDisplaySymbol(getAsset('BTC'))).toBe('BTC');
    expect(assetDisplaySymbol(getAsset('SOL'))).toBe('SOL');
    expect(assetDisplaySymbol(getAsset('USDC'))).toBe('USDC');
  });

  it('accepts a bare symbol string (looks it up)', () => {
    expect(assetDisplaySymbol('MATIC')).toBe('POL');
    expect(assetDisplaySymbol('ARB')).toBe('ETH');
  });

  it('returns the input string when lookup fails (fail-honest)', () => {
    expect(assetDisplaySymbol('NOT_A_REAL_ASSET')).toBe('NOT_A_REAL_ASSET');
    expect(assetDisplaySymbol('')).toBe('');
    expect(assetDisplaySymbol(null)).toBe('');
  });
});

describe('assetChainLabel', () => {
  it('overrides ERC-20 rows to "Ethereum"', () => {
    expect(assetChainLabel(getAsset('USDC'))).toBe('Ethereum');
    expect(assetChainLabel(getAsset('USDT'))).toBe('Ethereum');
  });

  it('uses asset.name for every non-ERC-20 row', () => {
    expect(assetChainLabel(getAsset('ETH'))).toBe('Ethereum');
    expect(assetChainLabel(getAsset('MATIC'))).toBe('Polygon');
    expect(assetChainLabel(getAsset('ARB'))).toBe('Arbitrum');
    expect(assetChainLabel(getAsset('OP'))).toBe('Optimism');
    expect(assetChainLabel(getAsset('AVAX'))).toBe('Avalanche');
    expect(assetChainLabel(getAsset('BNB'))).toBe('BNB Chain');
    expect(assetChainLabel(getAsset('BTC'))).toBe('Bitcoin');
    expect(assetChainLabel(getAsset('SOL'))).toBe('Solana');
  });

  it('returns empty string when lookup fails', () => {
    expect(assetChainLabel('NOT_A_REAL_ASSET')).toBe('');
    expect(assetChainLabel(null)).toBe('');
  });
});

describe('assetDisplayLabel — the canonical "DISPLAY (Chain)" shape', () => {
  it('matches Home for every current asset', () => {
    expect(assetDisplayLabel(getAsset('ETH'))).toBe('ETH (Ethereum)');
    expect(assetDisplayLabel(getAsset('USDC'))).toBe('USDC (Ethereum)');
    expect(assetDisplayLabel(getAsset('USDT'))).toBe('USDT (Ethereum)');
    expect(assetDisplayLabel(getAsset('MATIC'))).toBe('POL (Polygon)');
    expect(assetDisplayLabel(getAsset('ARB'))).toBe('ETH (Arbitrum)');
    expect(assetDisplayLabel(getAsset('OP'))).toBe('ETH (Optimism)');
    expect(assetDisplayLabel(getAsset('AVAX'))).toBe('AVAX (Avalanche)');
    expect(assetDisplayLabel(getAsset('BNB'))).toBe('BNB (BNB Chain)');
    expect(assetDisplayLabel(getAsset('BTC'))).toBe('BTC (Bitcoin)');
    expect(assetDisplayLabel(getAsset('SOL'))).toBe('SOL (Solana)');
  });
});
