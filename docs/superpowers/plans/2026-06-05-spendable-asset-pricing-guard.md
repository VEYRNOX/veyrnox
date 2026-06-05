# Spendable-Asset Pricing Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a test that fails when a `live` (sendable) asset lacks a positive `USD_RATES` entry, so `txLimits.toUsd` can never silently 1:1 under-count an unpriced spendable asset against spend caps.

**Architecture:** A single dedicated audit test (`src/lib/__tests__/spendableAssetPricing.test.js`) that imports the two existing sources of truth — `ASSETS`/`ASSET_STATUS` (`wallet-core/assets.js`, capability) and `USD_RATES` (`lib/cryptos.js`, display) — and asserts every `live` asset's symbol maps to a positive finite rate. Test-only; no production code changes; no new coupling in production. Mirrors `routeAudit.test.js` / `featureClassification.test.js` (one focused file per cross-module invariant).

**Tech Stack:** Vitest, `@/` alias (mirrors jsconfig.json; resolves both `wallet-core` and `lib`).

**Note on TDD shape:** the test depends only on modules that already exist, so there is no missing-import "red" phase — it is green against correct code by design. The guard's fail-when-wrong behavior is proven in Task 2 by a temporary mutation. Validated before this plan was written: current `live` set = `['ETH']`, `USD_RATES.ETH = 3200` → green.

Spec: `docs/superpowers/specs/2026-06-05-spendable-asset-pricing-guard-design.md`

---

### Task 1: Add the pricing-guard test (green by design)

**Files:**
- Create: `src/lib/__tests__/spendableAssetPricing.test.js`

- [ ] **Step 1: Write the test**

Create `src/lib/__tests__/spendableAssetPricing.test.js` with EXACTLY this content:

```js
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
```

- [ ] **Step 2: Run it and confirm it PASSES**

Run: `npx vitest run src/lib/__tests__/spendableAssetPricing.test.js`
Expected: PASS — 1 test. (`liveSymbols` is `['ETH']`; `USD_RATES.ETH` is `3200`,
a positive finite number, so `unpriced` is `[]`.)

If it FAILS, do NOT edit assets.js or cryptos.js to force green and do NOT weaken
the assertion — report the failure; it would mean a live asset is genuinely
unpriced (a real finding).

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/spendableAssetPricing.test.js
git commit -m "test(usd): guard that every live (sendable) asset is priced in USD_RATES"
```

---

### Task 2: Prove the guard bites, then full verification

The test is green by design; this task proves it is **not vacuous** and runs the
full gate. The mutation here is TEMPORARY and reverted — do NOT commit it.

**Files:** none committed (temporary edit to `src/wallet-core/assets.js`, reverted).

- [ ] **Step 1: Prove the guard bites**

In `src/wallet-core/assets.js`, find the MATIC line (MATIC is a sendable-capable
EVM asset that has NO USD_RATES entry):

```js
  { symbol: 'MATIC', name: 'Polygon',   family: 'evm',    chain: 'polygonAmoy',     status: ASSET_STATUS.RECEIVE_ONLY },
```

Temporarily change `ASSET_STATUS.RECEIVE_ONLY` to `ASSET_STATUS.LIVE` on that line only.

Run: `npx vitest run src/lib/__tests__/spendableAssetPricing.test.js`
Expected: **FAIL** — the assertion reports `...before flipping to live: MATIC`
(MATIC is now live but unpriced).

- [ ] **Step 2: Revert the mutation**

Run: `git checkout -- src/wallet-core/assets.js`
Then confirm clean: `git status --short` → expected empty (only the new test file
is committed; assets.js is back to its original state).

- [ ] **Step 3: Lint the new file**

Run: `npx eslint src/lib/__tests__/spendableAssetPricing.test.js --quiet`
Expected: exit 0, no output.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: PASS — previous green count **plus the 1 new test**, 0 failures. (No
production files changed, so nothing else moves.)

---

## Notes for the implementer

- This is test-only. If you find yourself editing `assets.js` or `cryptos.js`
  (other than the temporary, reverted MATIC mutation in Task 2), stop — that is
  out of scope.
- The `@/` alias resolves `@/wallet-core/assets.js` and `@/lib/cryptos.js` in
  Vitest (confirmed: existing wallet-core tests rely on it).
- `ASSET_STATUS.LIVE === 'live'` and `ASSETS` is a frozen array of
  `{ symbol, name, family, chain, status }`; both are named exports of
  `src/wallet-core/assets.js`. `USD_RATES` is a named export of
  `src/lib/cryptos.js` keyed by symbol.
