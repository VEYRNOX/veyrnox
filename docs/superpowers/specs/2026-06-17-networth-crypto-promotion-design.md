# Design: Promote NetWorth → "Crypto Net Worth" (live, crypto-only)

**Date:** 2026-06-17
**Status:** DESIGN — pre-implementation. On build: **BUILT / UNAUDITED-PROVISIONAL** (testnet; no on-chain
artifact → never "verified"). This is a deliberate **honest-disabled → live promotion** of `/net-worth`.
**Owner:** Al
**Cross-refs:** `docs/superpowers/specs/2026-06-16-live-price-helper-design.md` (the live-price helper this
builds on, now on `main`), `src/lib/portfolioBalances.js` (`usePortfolio`), `src/lib/featureClassification.js`
+ `src/lib/featureRegistry.js` (the route gate), `src/lib/usdDisclosure.js` (the disclosure guard),
`docs/Salvage-roadmap.md` (NetWorth was Tier-1).

---

## 1. Problem

`/net-worth` is **honest-disabled at the route level** (`featureClassification.js` verdict `'disabled'`,
`reason:'unverified'`), so `FeatureGate` renders `HonestDisabledPage` instead of the component. The
component itself is doubly-fake: crypto value = `base44.entities.Wallet` balances (stale/demo) × `USD_RATES`
(hardcoded stale), plus user-entered real-world assets. Now that the real on-chain aggregator
(`usePortfolio`) and the opt-in live-price helper are on `main`, the crypto half can be made genuinely real.

## 2. Settled decisions (brainstorming, 2026-06-17)

1. **Scope: CRYPTO-ONLY.** Promote NetWorth as a crypto holdings view (real on-chain balances + live/approx
   USD). **DROP the manual real-world assets** (house/pension/etc.). Reason: those live in a **global,
   non-vault-scoped `NetWorthAsset` IndexedDB table**, so a promoted page would show the real owner's wealth
   in a **coerced decoy session** — an I3 leak. Removal eliminates it; manual assets become a separate,
   deniability-reviewed follow-on (would need a per-vault store).
2. **Framing: "Crypto Net Worth"** + subtitle "Your on-chain holdings — does not include external assets."
   Crypto-only must not be titled plain "Net Worth" (implies total wealth) — honesty (no fake).
3. **Approach A: refactor the existing `NetWorthTracker.jsx`** (reuse the recharts pie + card layout; strip
   the fake/ manual parts) rather than rewrite.

## 3. Architecture

One honest data source, a refactored page, and a classification promotion gated by two existing test guards.

### 3.1 Data — `usePortfolio` only
All values from `usePortfolio(wallets, walletAddresses)` (already I3-safe; no `isDecoy` branch):
- **Total:** `sumPortfolioTotal(pfWallets, byWallet)` (the live/approx crypto USD) + its `indeterminate`.
- **Per-asset:** `assetTotals: { [symbol]: { amount, usd, indeterminate } }` — drives the chart + rows.
- **Basis:** `priceBasis` ('live'|'approx'), `pricesUpdatedAt`, `refetchPrices`.
No `base44.entities.Wallet`, no direct `USD_RATES` math, no `NetWorthAsset`.

### 3.2 UI — refactor `src/pages/NetWorthTracker.jsx`
- **Header:** title "Crypto Net Worth"; subtitle "Your on-chain holdings — does not include external assets."
- **Total card:** the crypto total with the live/approx indicator ("Live · HH:MM" + refresh, or
  "Approximate") — same pattern as the Dashboard total — plus a "· partial" marker when `indeterminate`.
- **Allocation donut (keep recharts):** segments = `assetTotals` by symbol (USD), via the new pure
  `buildAllocation(assetTotals)` helper; existing `CURRENCY_COLORS`/`CoinLogo`.
- **Per-asset rows:** symbol · amount · USD from `assetTotals`; an indeterminate row shows "—", never "$0"
  (match the Dashboard I4 formatter).
- **Remove:** the Add-Asset dialog, manual assets + liabilities sections, `NetWorthAsset` queries/mutations,
  the property/stocks/pension category machinery, and the `USD_RATES` / `base44 Wallet` imports.
- **Empty state:** no wallet → a brief "no holdings yet" message (no crash).

### 3.3 Promotion (honest-disabled → live)
- `featureClassification.js`: `/net-worth` → `{ verdict: 'live', note: '<honest note>' }`; **drop**
  `reason:'unverified'` and `dataSource:'base44-entities'` (a `live` entry carries no `reason`; the test at
  lines 44–50 forbids a `reason:'unverified'` route being live).
- `featureClassification.test.js`: remove `'/net-worth'` from the hard-coded non-live expected list
  (currently line 86), exactly as `/fee-analytics` was removed on its promotion (precedent in that file).
- `usdDisclosure.js`: add `'/net-worth': { discloses: true }` — a live route showing USD; the page keeps
  `approxUsd`/`ReferenceRateNote` for the approximate state so `usdDisclosure.test.js` A1/A2 pass.
- Un-gates automatically: `featureRouteOutcome('/net-worth')` returns `'render'` once verdict is `live`, so
  `FeatureGate` renders the component instead of `HonestDisabledPage`.

## 4. Invariants

- **I3 / deniability:** crypto-only via `usePortfolio` (session-scoped — a decoy sees only its own holdings);
  the manual-asset cross-session leak is **eliminated by removal** (the global `NetWorthAsset` table is no
  longer read/written here). No `isDecoy`/`isHidden` branch added.
- **I2:** live prices inherited from the opt-in helper (off by default → no egress); balances are the user's
  own RPC reads (existing path).
- **I4 / no fake security:** failed reads → "—"/partial (never silent 0); live-unavailable → labeled
  approximate; the page shows real on-chain data, honestly scoped to crypto by the title.
- **Status:** BUILT / UNAUDITED-PROVISIONAL; testnet; no on-chain artifact → not "verified".

## 5. Testing (TDD)

- New pure helper `buildAllocation(assetTotals)` → `[{ symbol, usd, color }]`, `usd > 0` only, stable order;
  handles empty/indeterminate (rows with `usd == null` excluded). Unit-tested in isolation.
- `featureClassification.test.js` + `usdDisclosure.test.js` updated and green — they enforce the promotion
  is internally consistent (verdict, registry, disclosure).
- No React-render test (repo has no component harness) — page wiring verified by the full suite staying
  green + `npm run build`.

## 6. Scope guard

- **Touched:** `src/pages/NetWorthTracker.jsx`, `src/lib/featureClassification.js`,
  `src/lib/__tests__/featureClassification.test.js`, `src/lib/usdDisclosure.js`, a new
  `buildAllocation` helper (+ test), `docs/Feature-Status.md`.
- **NOT touched:** `usePortfolio`/`portfolioBalances` (consumed as-is), the deniability stack, the
  `NetWorthAsset` store itself (just no longer used here), the live-price helper.

## 7. Out of scope (deferred follow-ons)

- **Manual real-world assets** (house/pension/etc.) — needs a per-vault/session-scoped store to be
  deniability-safe; a separate feature, not this promotion.
- Liabilities / full "total financial picture".
- Consolidating with the Dashboard total (NetWorth's differentiator is the allocation donut + dedicated
  framing; not merging here).
