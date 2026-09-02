// getAsset(key) must resolve BOTH composite ids (Phase 1a `enabledAssets`
// shape) AND bare symbols (legacy call sites). Without this the send picker,
// receive detector, portfolio balances and analytics all drop rows on any
// migrated wallet: they call getAsset(sym) on a value that is now
// "ETH:mainnet", .symbol never matches, returns null, row is skipped.

import { describe, it, expect } from 'vitest';
import { getAsset, ASSETS } from '../assets.js';

describe('getAsset dual-lookup (Phase 1a)', () => {
  it('resolves by composite id', () => {
    const eth = ASSETS.find((a) => a.symbol === 'ETH');
    expect(getAsset('ETH:mainnet')).toBe(eth);
  });
  it('still resolves by bare symbol (legacy)', () => {
    const btc = ASSETS.find((a) => a.symbol === 'BTC');
    expect(getAsset('BTC')).toBe(btc);
  });
  it('returns null on unknown key', () => {
    expect(getAsset('nope')).toBeNull();
    expect(getAsset('ETH:notachain')).toBeNull();
  });
});
