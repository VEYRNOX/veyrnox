# Design: Shared live-price helper + honest portfolio USD

**Date:** 2026-06-16
**Status:** DESIGN — pre-implementation. On build: **BUILT / UNAUDITED-PROVISIONAL** (testnet; no on-chain
artifact → never "verified"). Opt-in, off by default.
**Owner:** Al
**Cross-refs:** `docs/Salvage-roadmap.md` (Tier-1 wire), `src/lib/portfolioBalances.js` (the injection seam),
`src/lib/usdDisclosure.js` + `src/lib/__tests__/usdDisclosure.test.js` (the disclosure guard this satisfies),
`src/pages/Calculator.jsx` (the existing CryptoCompare usage pattern this generalizes),
`src/lib/featureClassification.js` (documents the stale-USD problem this fixes).

---

## 1. Problem

Every USD-denominated view (NetWorth, the wallet portfolio total, P&L, snapshots, budgets, receipts)
computes dollar values from `USD_RATES` — a **hardcoded, stale constant table** (`lib/cryptos.js`, BTC:
68000, ETH: 3200, …). The figures silently drift from reality. `NetWorthTracker` is worse: it reads
*base44-entity* wallet balances (demo/stale) AND stale prices, so both inputs are unreal. The app already
has (a) a real on-chain balance aggregator (`portfolioBalances.js`) and (b) a real, already-disclosed live
price feed (CryptoCompare, used by `Calculator`/PriceAlerts) — but they are not connected to the portfolio.

## 2. Settled decisions (brainstorming, 2026-06-16)

1. **Direction:** a shared live-price helper, wired into the central aggregator so NetWorth AND the main
   portfolio total become honest (real balances + live prices).
2. **Egress posture: OPT-IN, OFF BY DEFAULT (I2).** No price network call until the user explicitly enables
   it. Until then, USD stays the stale-but-disclosed `USD_RATES`.
3. **Injection point: Approach A — the central `portfolioBalances.js` aggregator** (optional price-map
   parameter, default-preserving), not per-page logic.

## 3. Architecture

One new module (the price source), one optional parameter threaded through the existing aggregator, and UI
that labels the price basis honestly. Calculator/PriceAlerts are NOT rewired (they work; consolidation is a
noted follow-on).

### 3.1 `src/lib/priceFeed.js` (new)
- **Opt-in pref:** `LIVE_PRICE_PREF_KEY = 'veyrnox-live-prices'`; `isLivePricesEnabled()` /
  `setLivePricesEnabled(on)` — localStorage, **absent = off** (mirrors `lib/biometric.js` / `auditLog.js`).
  Device-global; holdings-blind.
- **`fetchLivePricesUsd()`:** fetches USD prices for the **fixed full supported-symbol list** (derived from
  `ASSETS`/`cryptos`, NEVER from holdings → no oracle) via the existing CryptoCompare `pricemulti`
  endpoint. Returns `{ [symbol]: number }`. Throws on network/HTTP failure (caller treats as unavailable).
- **`useLivePrices()`:** react-query hook, **`enabled: isLivePricesEnabled()`** (OFF ⇒ no fetch ⇒ no
  egress, I2), conservative caching (`staleTime` 5 min, no tight `refetchInterval`), exposes `refetch` for
  manual refresh. Returns `{ prices, isLoading, isError, updatedAt }`.
- **`pickUsdRate({ live, symbol, livePrices, liveOk })`:** pure fail-closed selector —
  - live on + `liveOk` + `livePrices[symbol]` present → the live price;
  - live on + fetch failed (`!liveOk`) → `USD_RATES`/stablecoin fallback, **flagged approximate**;
  - off → `USD_RATES`/stablecoin fallback.
  Never fabricates a number; stablecoins (USDC/USDT) resolve to 1 as today.

### 3.2 Settings toggle + egress disclosure
A "Live market prices" switch in `src/pages/Settings.jsx`, off by default, with plain-language disclosure:
*"Fetches current prices from CryptoCompare. Off by default — your wallet makes no price calls until you
turn this on. The request sends only a fixed list of supported coins, never your holdings or addresses."*
Toggling sets the pref; nothing else changes when off.

### 3.3 `src/lib/portfolioBalances.js` (additive, default-preserving)
- `usdRate(symbol, livePrices?)` → `livePrices[symbol]` when provided, else `USD_RATES` (unchanged default).
- `computePortfolio(wallets, walletAddresses, livePrices?)` threads the map through; the existing I4
  `indeterminate` (failed read ≠ 0) logic is untouched. Result gains `priceBasis: 'live' | 'approx'`.
- `usePortfolio(...)` composes `useLivePrices()` internally: live on + ok → pass the map, `priceBasis:
  'live'`; else `priceBasis: 'approx'`. The price map is OPTIONAL, so every existing caller keeps working
  unchanged.

### 3.4 `src/pages/WalletPortfolioPage` — honest headline total (THIS build's surfacing target)
The Dashboard total (`/`, already a `{discloses:true}` route) already uses `usePortfolio`, so it inherits
the injected price basis automatically. Add a compact **price-basis indicator** — "Live · updated HH:MM" +
manual refresh when live; the existing `approxUsd` / `ReferenceRateNote` "approximate (reference rates)"
disclosure when off/unavailable — so the basis is visible and honest. The existing I4 `indeterminate`
"incomplete" marking is preserved.

### 3.5 NetWorthTracker — SPLIT OUT to a follow-on build (scope decision, 2026-06-16)
NetWorth is **honest-disabled at the route level** (`featureRouteOutcome('/net-worth') === 'disabled'` via
`featureClassification.js` verdict `'disabled'`), so its fake UI is not even shown today. "Making it real"
is a deliberate **honest-disabled → live promotion** (rewire onto `usePortfolio` + flip the verdict +
un-gate + add `USD_DISCLOSURE`/classification entries), touching two extra guards
(`featureClassification.test.js`, `usdDisclosure.test.js`). That is a separate, reviewable change and is
**out of scope here** — this build delivers the shared helper + the honest portfolio total, on which the
NetWorth promotion later builds.

## 4. Invariants

- **I2 (no silent egress):** off by default → zero price calls; the hook is `enabled`-gated; enabling is
  explicit and disclosed.
- **I3 / deniability:** the request is holdings-agnostic (fixed full symbol list), identical in decoy/real
  sessions (`portfolioBalances` has no `isDecoy` branch), the pref is device-global and holdings-blind — no
  oracle that could reveal holdings or a hidden set.
- **I4 fail-closed / no fake security:** a failed live fetch never renders stale-as-live — it degrades to
  clearly-labeled approximate; never fabricates a price; existing `indeterminate` handling preserved.
- **Disclosure guard:** NetWorth/portfolio keep their `USD_DISCLOSURE` `{discloses:true}` entry (they still
  import `USD_RATES` for the fallback) and reference `approxUsd`/`ReferenceRateNote`, so
  `usdDisclosure.test.js` stays green.

## 5. Testing (TDD — write tests first)

- `priceFeed`: pref on/off round-trips (absent = off); `fetchLivePricesUsd` (mocked `fetch`) requests the
  **fixed full symbol list** (assert holdings-agnostic — the request never narrows to enabled/held assets)
  and throws on HTTP error; `pickUsdRate` truth table (live-ok→live, live-failed→approx fallback,
  off→approx); never returns a fabricated number for an unknown non-stablecoin symbol when live (stays at
  the documented fallback).
- `portfolioBalances`: `usdRate`/`computePortfolio` use the live map when given and fall back to `USD_RATES`
  when not; `priceBasis` is correct; all existing portfolioBalances tests stay green (optional param).
- `usdDisclosure.test.js` stays green (NetWorth entry kept/added).
- No live network in tests (mock `fetch`). No React-render tests (repo has no component harness) — the
  Settings/NetWorth/portfolio UI wiring is verified by the full suite staying green + `npm run build`.

## 6. Scope guard

- **New:** `src/lib/priceFeed.js` + its test.
- **Modified:** `src/lib/portfolioBalances.js` (+test), `src/pages/WalletPortfolioPage.jsx` (the total
  indicator), `src/pages/Settings.jsx` (toggle), `docs/Feature-Status.md`.
- **NOT touched:** `NetWorthTracker.jsx` + its classification verdict (split to a follow-on, §3.5);
  `usdDisclosure.js` registry (`/` is already `{discloses:true}`, no new entry needed); Calculator /
  PriceAlerts (already work; consolidation is a noted follow-on); balance-reading internals; any signing
  path; the `isDecoy`/`isHidden` logic.

## 7. Out of scope

- Multi-fiat for the portfolio (USD-only here; Calculator keeps its own multi-fiat).
- Consolidating Calculator/PriceAlerts onto the shared helper (follow-on).
- The other stale-USD consumers (P&L, SpendingPatterns, snapshots, budgets, receipts) — they benefit
  indirectly only if they already use `portfolioBalances`; rewiring each is separate salvage work.
- Price history / charts (no OHLC feed; the fabricated PriceCharts stays a separate honest-disable item).
