# Design: Consolidate CryptoCompare price egress into one module

**Date:** 2026-06-17
**Status:** DESIGN — pre-implementation. Refactor + privacy hardening. On build: **BUILT /
UNAUDITED-PROVISIONAL** (testnet; behavior-preserving — no new user capability).
**Owner:** Al
**Cross-refs:** `src/lib/priceFeed.js` (#200 opt-in helper), `src/hooks/useBasketPrices.js`,
`src/hooks/usePriceAlertNotifier.js`, `src/pages/Calculator.jsx` (the four callers), `src/lib/cryptos.js`
(`TOP_SYMBOLS`), `src/wallet-core/assets.js` (`ASSETS`).

---

> **Execution note (2026-06-17):** the recon under-counted — there were **five** price callers, not four.
> `src/pages/PriceAlerts.jsx` had its own inline `fetchLivePrices` (found during Task 3) and was migrated
> too. Everything below applies to it identically (market USD universe). The "four" framing in this section
> is the original count; the built feature centralizes all five.

## 1. Problem

Four files independently call the CryptoCompare price API, each re-declaring the base URL/params and each
relying on a **per-file comment** to uphold the deniability invariant "never narrow `fsyms` to holdings":
- `lib/priceFeed.js` — `pricemulti`, USD, fixed `SUPPORTED_SYMBOLS` (opt-in, #200).
- `pages/Calculator.jsx` — `pricemulti`, multi-fiat, fixed `CRYPTOS` (always-on).
- `hooks/usePriceAlertNotifier.js` — `pricemulti`, USD, hardcoded 10-symbol URL (always-on, 60s).
- `hooks/useBasketPrices.js` — `pricemultifull` (adds CHANGEPCT24HOUR), USD, fixed `TOP_SYMBOLS`.

The invariant being a convention (not enforced) is the risk: a future edit could narrow a request to held
assets and silently turn the price feed into a holdings oracle. Centralizing the egress makes the invariant
structural and gives one auditable point for all third-party price traffic.

## 2. Settled decisions (brainstorming, 2026-06-17)

1. **Scope: FULL** — one module owns all price egress; migrate all four callers.
2. **TWO symbol universes, not one.** The wallet's holdable `ASSETS` (ETH/USDC/USDT/MATIC/ARB/OP/AVAX/BNB/
   BTC/SOL — for portfolio valuation) and the top-market basket (BTC/ETH/USDT/BNB/SOL/USDC/XRP/DOGE/ADA/TRX
   — for Calculator/alerts/basket display) are genuinely different sets. Both are holdings-agnostic.
   Collapsing them would change which coins Calculator/alerts offer — a feature change, out of scope. The
   module keeps both as fixed constants.
3. **Behavior-preserving** — same coins, fiats, 24h-change, polling cadences, and the portfolio opt-in gate.
4. **News out of scope** — `CryptoNewsFeed.jsx` uses a different (news) endpoint; left as-is.

## 3. Architecture

### 3.1 `src/lib/cryptoCompare.js` (new) — the single egress module
- Owns the base host + `extraParams=safecryptowallet` and both endpoints (`pricemulti`, `pricemultifull`).
- **Two frozen symbol constants:** `PORTFOLIO_SYMBOLS` (derived from `ASSETS`) and `MARKET_SYMBOLS` (the
  top-coin basket — the canonical replacement for the scattered `CRYPTOS` / `TOP_SYMBOLS` / hardcoded list).
- **Structural holdings-agnostic guarantee:** no fetcher accepts a caller-supplied `fsyms`; each sources its
  symbol list ONLY from a module constant. `tsyms`/fiats may be passed (fiats reveal nothing about holdings).
- Fetchers (each throws on non-OK — I4):
  - `fetchPortfolioPricesUsd()` → `{ [sym]: number }` — `pricemulti`, USD, `PORTFOLIO_SYMBOLS`.
  - `fetchMarketPricesUsd()` → `{ [sym]: number }` — `pricemulti`, USD, `MARKET_SYMBOLS`.
  - `fetchMarketPricesFiat(fiats)` → `{ [sym]: { [fiat]: number } }` — `pricemulti`, multi-fiat (raw shape
    Calculator expects), `MARKET_SYMBOLS`.
  - `fetchMarketChanges24h()` → `{ [sym]: { change24h: number|null } }` — `pricemultifull`, `MARKET_SYMBOLS`.

### 3.2 Migrate the four callers (fetch + symbol source move into the module; everything else stays)
- `priceFeed.js`: `fetchLivePricesUsd` delegates to `fetchPortfolioPricesUsd()`; the opt-in `enabled`-gate,
  5-min cache, and `useLivePrices` return shape are unchanged. (`SUPPORTED_SYMBOLS` either re-exports
  `PORTFOLIO_SYMBOLS` or is replaced by it; keep the existing public name if other code imports it.)
- `useBasketPrices.js`: `fetchBasket` delegates to `fetchMarketChanges24h()`; the 10-min react-query +
  `changeFor`/`isLive` contract unchanged.
- `usePriceAlertNotifier.js`: the raw `fetch(PRICE_URL)` becomes `fetchMarketPricesUsd()`; the 60s
  `setInterval` polling + alert-evaluation logic unchanged.
- `Calculator.jsx`: `fetchPrices` delegates to `fetchMarketPricesFiat(FIATS)`; the 30s react-query unchanged;
  its crypto dropdown now sources `MARKET_SYMBOLS` (same 10 coins it lists today).

## 4. Invariants

- **I2 / deniability:** every request stays byte-identical-per-user (fixed lists), now enforced in ONE
  module; no request is derivable from holdings. No new domain/endpoint.
- **No behavior change:** identical coins/fiats/24h-change/cadences; portfolio path stays opt-in, the three
  market tools stay always-on (unchanged from today).
- **I4 / fail-honest:** fetchers throw on failure; each caller's existing fail-closed handling is preserved.

## 5. Testing (TDD)

- New `src/lib/__tests__/cryptoCompare.test.js` (mock `fetch`): each fetcher requests the correct FIXED
  symbol constant (assert no fetcher takes an `fsyms` arg → holdings-agnostic by construction), targets the
  right endpoint (`pricemulti` vs `pricemultifull`), parses the expected shape, and throws on non-OK.
- `priceFeed.test.js` stays green (its fetch now delegates; the holdings-agnostic + throw-on-error
  assertions still hold).
- Migrated callers verified by the full suite staying green + `npm run build` (no React render harness).

## 6. Scope guard

- **New:** `src/lib/cryptoCompare.js` + test.
- **Modified:** `src/lib/priceFeed.js`, `src/hooks/useBasketPrices.js`, `src/hooks/usePriceAlertNotifier.js`,
  `src/pages/Calculator.jsx`, and a tidy of `CRYPTOS` / `TOP_SYMBOLS` where fully replaced by
  `MARKET_SYMBOLS` (only if no other importer remains — verify before removing).
- **NOT touched:** `portfolioBalances` (consumes `priceFeed` unchanged), `CryptoNewsFeed.jsx`, any
  signing/balance path, the two symbol universes' membership.

## 7. Out of scope

- Unifying the portfolio vs market symbol universes (feature change).
- The news endpoint.
- Any change to polling cadence or the opt-in model.
