# Spendable-asset pricing guard

**Date:** 2026-06-05
**Branch:** `test/spendable-asset-pricing` (off `main`)
**Status:** Approved design — ready for implementation plan

## Problem

Spend limits (`src/lib/txLimits.js`) convert each send to USD via the static
`USD_RATES` table to compare against USD-denominated caps. `toUsd` falls back to
`1:1` for any currency without a rate:

```js
const rate = usdRates?.[currency] ?? 1;   // unknown currency -> 1 unit = $1
```

The set of **spendable** assets and the set of **priced** assets are two
separate sources of truth that already diverge:

- `src/wallet-core/assets.js` (capability) — `canSend(a)` ⇔ `a.status === 'live'`.
  Carries `MATIC`, `ARB`, `OP`, `AVAX` (EVM L2s).
- `src/lib/cryptos.js` (display) — `USD_RATES` keys are the top-10:
  `BTC ETH USDT BNB SOL USDC XRP DOGE ADA TRX`. **No** MATIC/ARB/OP/AVAX.

Today only `ETH` is `live`, and `ETH` is priced, so there is no active bug.
But flipping a rate-less asset to `live` — described in `assets.js` as "a
deliberate, one-line change" — would make `toUsd` silently value it at `$1/unit`.
A daily spend cap would then **under-count** that asset (e.g. 100 ARB counted as
\$100), letting far more real value through before the cap trips. The self-
discipline guardrail would quietly fail open for that asset, with no failing test.

## Goal & non-goals

**Goal:** a test that fails when a `live` asset lacks a usable `USD_RATES` entry,
forcing a rate to be added *before* send is enabled.

**Non-goals:**
- **No production code change.** Test-only. No new coupling between
  `wallet-core/assets.js` and `lib/cryptos.js` — the test merely *asserts* a
  consistency invariant between the two existing sources of truth (the
  display-vs-capability separation is preserved in production code).
- **No change to `toUsd` / spend-enforcement behavior.** The `1:1` fallback
  stays; this guard prevents the dangerous *state* (an unpriced live asset) from
  ever shipping, rather than altering runtime math.

## The invariant

For every asset with `status === ASSET_STATUS.LIVE` (i.e. `canSend`),
`USD_RATES[symbol]` must be a **positive finite number**.

`> 0 && Number.isFinite` (not merely "key present") because `toUsd`'s
`usdRates?.[currency] ?? 1` does **not** rescue a `0` rate (`0 ?? 1 === 0`), so a
zero/NaN rate would also under-count. Guarding the value covers both the
missing-key and bad-value cases.

## Component

A dedicated audit test — `src/lib/__tests__/spendableAssetPricing.test.js` —
matching the codebase idiom of one focused file per cross-module invariant
(`routeAudit.test.js`, `featureClassification.test.js`). The filename documents
the rule.

```js
// src/lib/__tests__/spendableAssetPricing.test.js
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
```

## Edge cases / error handling

- **Missing rate** → `USD_RATES[s] === undefined` → fails the `> 0 && isFinite`
  check → reported.
- **Zero / NaN rate** → also fails (see invariant rationale).
- **Empty/!changed `ASSETS`** → the sentinel `liveSymbols.length > 0` fails
  loudly rather than passing vacuously.

## Green today / prove-it-bites

- Current `live` set = `['ETH']`; `USD_RATES.ETH = 3200` → green on first run.
- The plan proves the guard is non-vacuous by temporarily flipping a rate-less
  asset (`MATIC`) to `LIVE` and confirming the assertion fails with `MATIC` named,
  then reverting.

## Affected files

- `src/lib/__tests__/spendableAssetPricing.test.js` — new test. No other files.

## Testing

The test is the deliverable. Full suite stays green (+1 file, +1 test). Lint
clean. No production files touched.
