// src/lib/__tests__/spendableAssetPricing.test.js
//
// Guards the seam between two separate sources of truth:
//   - wallet-core/assets.js  — capability: canSend(a) <=> a.status === 'live'
//   - lib/cryptos.js         — display:   USD_RATES (static top-10 prices)
// txLimits.toUsd converts a send to USD via USD_RATES and falls back to 1:1 for
// any unpriced currency. So a `live` (sendable) asset with no USD_RATES entry
// would be valued at $1/unit and UNDER-counted against spend caps. This test
// fails the moment a rate-less asset is flipped to `live`, forcing a rate to be
// added first. (Today only ETH is live, and ETH is priced — green.)
import { describe, it, expect } from 'vitest';
import { ASSETS, ASSET_STATUS } from '@/wallet-core/assets.js';
import { USD_RATES } from '@/lib/cryptos.js';

describe('spendable assets are priced', () => {
  it('every live (sendable) asset has a positive USD_RATES entry', () => {
    const liveSymbols = ASSETS
      .filter((a) => a.status === ASSET_STATUS.LIVE)
      .map((a) => a.symbol);

    // Sentinel: never pass vacuously if ASSETS shape/status parsing changes.
    expect(liveSymbols.length, 'no live (sendable) assets found').toBeGreaterThan(0);

    const unpriced = liveSymbols.filter(
      (s) => !(Number.isFinite(USD_RATES[s]) && USD_RATES[s] > 0),
    );
    expect(
      unpriced,
      `live (sendable) assets missing a positive USD_RATES entry — txLimits.toUsd ` +
        `would value them at 1:1 ($1/unit) and UNDER-count them against spend caps. ` +
        `Add a rate in src/lib/cryptos.js (TOP_CRYPTOS) before flipping to live: ${unpriced.join(', ')}`,
    ).toEqual([]);
  });
});
