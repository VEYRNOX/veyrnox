// wallet-core/__tests__/assets.phase1b.test.js
//
// Phase 1b (docs/per-chain-expansion-scope.md): USDC/USDT rows on the 5 EVM
// chains Veyrnox already supports. Every row ships receive_only — no on-chain
// UI-path send has been captured yet (I4 fail-honest).
import { describe, it, expect } from 'vitest';
import { ASSETS, getAsset, getAssetById, canSend, canReceive, ASSET_STATUS } from '../assets.js';
import { TOKENS } from '../evm/tokens.js';

const PHASE_1B_CHAINS = ['polygon', 'arbitrum', 'optimism', 'avalanche', 'bnb'];

describe('Phase 1b — per-chain USDC/USDT rows', () => {
  const experimentalRows = ASSETS.filter((a) => a.experimental);

  it('adds exactly 10 experimental rows (2 symbols × 5 chains)', () => {
    expect(experimentalRows).toHaveLength(10);
  });

  it('every experimental row is receive_only and experimental', () => {
    for (const a of experimentalRows) {
      expect(a.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
      expect(a.experimental).toBe(true);
    }
  });

  it('canSend() rejects every experimental row (I4 fail-honest — no send verified yet)', () => {
    for (const a of experimentalRows) {
      expect(canSend(a)).toBe(false);
    }
  });

  it('canReceive() allows every experimental row', () => {
    for (const a of experimentalRows) {
      expect(canReceive(a)).toBe(true);
    }
  });

  it('covers USDC and USDT on all 5 target chains', () => {
    const pairs = experimentalRows.map((a) => `${a.symbol}:${a.chain}`).sort();
    const expected = ['USDC', 'USDT']
      .flatMap((symbol) => PHASE_1B_CHAINS.map((chain) => `${symbol}:${chain}`))
      .sort();
    expect(pairs).toEqual(expected);
  });

  it('every row\'s (symbol, chain) matches a real TOKENS entry with the same symbol', () => {
    for (const a of experimentalRows) {
      const token = TOKENS[a.chain]?.[a.symbol];
      expect(token, `TOKENS.${a.chain}.${a.symbol} missing`).toBeTruthy();
      expect(token.symbol).toBe(a.symbol);
    }
  });

  it('BNB rows use 18 decimals; every other chain uses 6', () => {
    for (const a of experimentalRows) {
      const token = TOKENS[a.chain][a.symbol];
      expect(token.decimals).toBe(a.chain === 'bnb' ? 18 : 6);
    }
  });

  it('getAssetById resolves the exact per-chain row', () => {
    const row = getAssetById('USDC:polygon');
    expect(row).toBeTruthy();
    expect(row.chain).toBe('polygon');
    expect(row.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
  });

  it('getAsset (first-match) still returns the ORIGINAL mainnet USDC — Phase 0 behaviour preserved', () => {
    const usdc = getAsset('USDC');
    expect(usdc.chain).toBe('mainnet');
    expect(usdc.status).toBe(ASSET_STATUS.LIVE);
    expect(usdc.experimental).toBeUndefined();
  });
});
