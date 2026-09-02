// wallet-core/__tests__/assetId.test.js — Phase 0 vocabulary tests.
import { describe, it, expect } from 'vitest';
import { formatAssetId, parseAssetId, isAssetIdString } from '../assetId.js';
import { ASSETS } from '../assets.js';

describe('formatAssetId', () => {
  it('joins symbol and chain with a colon', () => {
    expect(formatAssetId({ symbol: 'USDC', chain: 'polygon' })).toBe('USDC:polygon');
    expect(formatAssetId({ symbol: 'ETH',  chain: 'arbitrum' })).toBe('ETH:arbitrum');
  });

  it('accepts every current ASSETS entry (1:1 with symbol today)', () => {
    // Phase 0 property: no duplicate ids in the current registry. Duplicate
    // symbols across chains land in Phase 1 — when they do, ids stay unique.
    const ids = ASSETS.map((a) => formatAssetId(a));
    expect(new Set(ids).size).toBe(ASSETS.length);
  });

  it('rejects malformed symbol', () => {
    expect(() => formatAssetId({ symbol: 'usdc', chain: 'polygon' })).toThrow();
    expect(() => formatAssetId({ symbol: 'US:DC', chain: 'polygon' })).toThrow();
    expect(() => formatAssetId({ symbol: '', chain: 'polygon' })).toThrow();
  });

  it('rejects malformed chain', () => {
    expect(() => formatAssetId({ symbol: 'USDC', chain: 'Polygon' })).toThrow();
    expect(() => formatAssetId({ symbol: 'USDC', chain: 'poly:gon' })).toThrow();
    expect(() => formatAssetId({ symbol: 'USDC', chain: '' })).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => formatAssetId(null)).toThrow();
    expect(() => formatAssetId('USDC:polygon')).toThrow();
  });
});

describe('parseAssetId', () => {
  it('round-trips every well-formed id', () => {
    for (const a of ASSETS) {
      const id = formatAssetId(a);
      expect(parseAssetId(id)).toEqual({ symbol: a.symbol, chain: a.chain });
    }
  });

  it('returns null on malformed input (never a partial parse)', () => {
    expect(parseAssetId('USDC')).toBeNull();          // no chain
    expect(parseAssetId('USDC:')).toBeNull();          // empty chain
    expect(parseAssetId(':polygon')).toBeNull();       // empty symbol
    expect(parseAssetId('usdc:polygon')).toBeNull();   // lowercase symbol
    expect(parseAssetId('USDC:POLYGON')).toBeNull();   // uppercase chain
    expect(parseAssetId('USDC:polygon:extra')).toBeNull();
    expect(parseAssetId(null)).toBeNull();
    expect(parseAssetId(undefined)).toBeNull();
    expect(parseAssetId(123)).toBeNull();
  });
});

describe('isAssetIdString', () => {
  it('discriminates composite ids from legacy symbol-only strings', () => {
    // The Phase 1 sanitizer will need to tolerate BOTH shapes on read.
    expect(isAssetIdString('USDC:polygon')).toBe(true);
    expect(isAssetIdString('USDC')).toBe(false);
    expect(isAssetIdString('')).toBe(false);
    expect(isAssetIdString(null)).toBe(false);
    expect(isAssetIdString(42)).toBe(false);
  });
});
