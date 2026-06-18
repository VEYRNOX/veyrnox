# Analytics & Portfolio — Local-First Migration Design

**Date:** 2026-06-17  
**Status:** Approved  
**Scope:** Migrate 6 analytics/portfolio pages from base44 API to local-first data stack

---

## Problem

All 6 analytics/portfolio pages (`Analytics`, `AdvancedAnalytics`, `PortfolioSnapshots`, `PortfolioBenchmark`, `PortfolioRiskScore`, `PortfolioRewind`) still call `base44Client`. The rest of the app has moved to local-first. These pages need to join that model.

Additionally, several pages contain hardcoded or synthetic data (fake benchmark curves, hardcoded price history multipliers, synthetic monthly returns) that misrepresents the wallet's data as real.

---

## Architecture

### New Files

**`src/hooks/useAnalytics.js`** — shared data hook consumed by all 6 pages.

Returns:
```js
{
  portfolio,      // from computePortfolio() — per-wallet, per-asset, USD totals
  history,        // from txHistory — per-asset tx arrays for active wallet set
  prices,         // from priceFeed — null if opt-in not enabled
  pricesEnabled,  // boolean
  loading,
  error
}
```

No new data egress — wraps existing `portfolioBalances.js`, `txHistory.js`, and `priceFeed.js`.

**`src/lib/snapshotStore.js`** — encrypted localStorage CRUD for portfolio snapshots.

- Keyed by active wallet set (address fingerprint), not wallet name (deniability: same key shape for real and decoy sessions)
- Entries cleared on vault lock (no persistent footprint outlasting a session unlock)
- Operations: `saveSnapshot(portfolio, label, note)`, `listSnapshots()`, `deleteSnapshot(id)`
- Fails honest: read failure returns empty list, never throws into page render

### Modified Files

All 6 pages: remove `base44` import, consume `useAnalytics()` instead.

---

## Per-Page Migration

### `Analytics.jsx`
- Portfolio allocation pie: `portfolio.perAsset`
- Monthly activity bars: `history` bucketed by month (reuse `spendByPeriod` logic)
- Net PnL card: shown only when `pricesEnabled`, otherwise opt-in prompt
- No base44 dependency remains

### `AdvancedAnalytics.jsx`
- Replace base44 wallet fetch with `useAnalytics()`
- Hardcoded VOLATILITY/SHARPE/CORRELATION constants retained — reference tables, not fetched data; 5-asset coverage is honest for testnet scope
- Monthly performance chart: replace synthetic sine-wave data with real per-month outflow buckets from `history` (native units)
- No fake data remains in critical paths

### `PortfolioSnapshots.jsx`
- Replace base44 CRUD with `snapshotStore`
- Save: writes current `portfolio` state (balances + USD totals if prices enabled)
- Delete: removes by ID from store
- List: reads all snapshots for active wallet set
- Change-vs-previous calculation unchanged, reads from local store

### `PortfolioRiskScore.jsx`
- Replace base44 wallet/loans/staking fetches with `useAnalytics()`
- Staking and loans sub-scores removed (no local data source; honest omission)
- Remaining dimensions: concentration (Herfindahl index), volatility (reference table), balance age
- Risk radar updated to 3 dimensions

### `PortfolioBenchmark.jsx`
- Gated on `pricesEnabled`
- When off: full-page opt-in prompt (same pattern as NetWorthTracker)
- When on: portfolio return derived from tx history + current prices vs `USD_RATES` baseline
- Synthetic BTC/S&P500 benchmark lines removed; replaced with honest disclosure: "Benchmark comparison requires historical market data — not available in local-only mode"

### `PortfolioRewind.jsx`
- Gated on `pricesEnabled`
- When off: full-page opt-in prompt
- When on: rewind derived from tx history walked backwards from current balance (same approach as `PortfolioChart.jsx`)
- Hardcoded PRICE_HISTORY multipliers removed entirely

---

## Error Handling & Honest Disclosure (I4)

| Condition | Behaviour |
|-----------|-----------|
| Balance read fails | `portfolio: null` → "Unable to load portfolio data"; never show $0 or stale data |
| No tx history | `history: []` → empty chart state; no synthetic fills |
| Prices disabled | `pricesEnabled: false` → USD views show opt-in prompt; native-unit views render normally |
| Prices fetch fails | `prices: null` → treated same as disabled; no fallback to USD_RATES for live views |
| Snapshot store read fails | Empty list + error notice; page does not crash |
| No wallet unlocked | `useAnalytics` returns early → pages redirect to unlock |

---

## What Is Not Changing

- Deniability design: no `isDecoy` branches added; session-scoped wallet addresses seal the decoy automatically
- `USD_RATES` remains for reference-rate-only displays (e.g. concentration score denominator)
- `priceFeed` opt-in gate unchanged — no new egress paths
- Hardcoded volatility/Sharpe/correlation constants in `AdvancedAnalytics` kept as reference tables (not live data)

---

## Out of Scope

- Real historical benchmark data (S&P500, BTC price series) — requires external API, post-audit
- Fiat cost-basis / tax analytics — Slice 2, audit-gated
- Cloud snapshot sync — post-audit
