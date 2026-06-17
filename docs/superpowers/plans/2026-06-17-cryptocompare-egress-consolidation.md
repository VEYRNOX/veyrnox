# Consolidate CryptoCompare Price Egress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route ALL third-party price traffic through one `cryptoCompare` module that structurally enforces the holdings-agnostic invariant (no fetcher takes a caller-supplied symbol list), migrating the four existing callers with zero behavior change.

**Architecture:** New `lib/cryptoCompare.js` owns the base URL, both endpoints (`pricemulti`/`pricemultifull`), and two frozen symbol universes — `PORTFOLIO_SYMBOLS` (from `ASSETS`) and `MARKET_SYMBOLS` (= `cryptos.js` `TOP_SYMBOLS`). Four fetchers source `fsyms` only from those constants. The four callers keep their own react-query/intervals/parsing; only the fetch + symbol source move into the module.

**Tech Stack:** JS (ESM), Vitest (mock `fetch`), react-query, CryptoCompare `pricemulti` + `pricemultifull`.

**Spec:** `docs/superpowers/specs/2026-06-17-cryptocompare-egress-consolidation-design.md`

**Verified facts:** `TOP_SYMBOLS` = `[BTC,ETH,USDT,BNB,SOL,USDC,XRP,DOGE,ADA,TRX]` is byte-identical to Calculator's local `CRYPTOS` and the alert notifier's hardcoded `fsyms` (same symbols, same order) — so `MARKET_SYMBOLS = TOP_SYMBOLS` is behavior-preserving for all three. `TOP_SYMBOLS`/`TOP_CRYPTOS` have other importers (CustomIndexBuilder, WatchlistPage, tests) and **must stay** in `cryptos.js`. `SUPPORTED_SYMBOLS` is used only by `priceFeed.js` + its test.

---

## File Structure

- `src/lib/cryptoCompare.js` — **create.** The single egress module (2 constants + 4 fetchers).
- `src/lib/__tests__/cryptoCompare.test.js` — **create.** Mock-fetch tests.
- `src/lib/priceFeed.js` — **modify.** Delegate to `fetchPortfolioPricesUsd`; source `PORTFOLIO_SYMBOLS`; re-export `SUPPORTED_SYMBOLS` for back-compat.
- `src/hooks/useBasketPrices.js` — **modify.** Delegate to `fetchMarketChanges24h`.
- `src/hooks/usePriceAlertNotifier.js` — **modify.** Delegate to `fetchMarketPricesUsd`.
- `src/pages/Calculator.jsx` — **modify.** Delegate to `fetchMarketPricesFiat`; drop local `CRYPTOS`.

---

## Task 1: Create `lib/cryptoCompare.js` + tests

**Files:**
- Create: `src/lib/cryptoCompare.js`
- Test: `src/lib/__tests__/cryptoCompare.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/cryptoCompare.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PORTFOLIO_SYMBOLS, MARKET_SYMBOLS,
  fetchPortfolioPricesUsd, fetchMarketPricesUsd, fetchMarketPricesFiat, fetchMarketChanges24h,
} from '../cryptoCompare.js';

afterEach(() => vi.restoreAllMocks());

const ok = (json) => vi.fn(async () => ({ ok: true, json: async () => json }));

describe('cryptoCompare — holdings-agnostic by construction', () => {
  it('no USD/changes fetcher accepts a caller symbol list (arity 0)', () => {
    expect(fetchPortfolioPricesUsd.length).toBe(0);
    expect(fetchMarketPricesUsd.length).toBe(0);
    expect(fetchMarketChanges24h.length).toBe(0);
  });

  it('fetchPortfolioPricesUsd requests the fixed PORTFOLIO_SYMBOLS in USD and returns a flat map', async () => {
    const f = ok(Object.fromEntries(PORTFOLIO_SYMBOLS.map((s) => [s, { USD: 5 }])));
    vi.stubGlobal('fetch', f);
    const out = await fetchPortfolioPricesUsd();
    const url = f.mock.calls[0][0];
    expect(url).toContain('/pricemulti?');
    for (const s of PORTFOLIO_SYMBOLS) expect(url).toContain(s);
    expect(url).toContain('tsyms=USD');
    expect(out).toEqual(Object.fromEntries(PORTFOLIO_SYMBOLS.map((s) => [s, 5])));
  });

  it('fetchMarketPricesUsd requests the fixed MARKET_SYMBOLS in USD', async () => {
    const f = ok(Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 9 }])));
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketPricesUsd();
    const url = f.mock.calls[0][0];
    for (const s of MARKET_SYMBOLS) expect(url).toContain(s);
    expect(out.BTC).toBe(9);
  });

  it('fetchMarketPricesFiat passes fiats as tsyms and returns the raw matrix', async () => {
    const raw = Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 1, EUR: 2 }]));
    const f = ok(raw);
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketPricesFiat(['USD', 'EUR']);
    const url = f.mock.calls[0][0];
    expect(url).toContain('tsyms=USD,EUR');
    expect(out.BTC.EUR).toBe(2);
  });

  it('fetchMarketChanges24h uses pricemultifull and maps CHANGEPCT24HOUR', async () => {
    const raw = { RAW: Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: { CHANGEPCT24HOUR: 3.5 } }])) };
    const f = ok(raw);
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketChanges24h();
    expect(f.mock.calls[0][0]).toContain('/pricemultifull?');
    expect(out.ETH.change24h).toBe(3.5);
  });

  it('throws on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchMarketPricesUsd()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/cryptoCompare.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/cryptoCompare.js`**

```js
// lib/cryptoCompare.js — the SINGLE point of third-party price egress.
//
// All CryptoCompare price traffic goes through here. The deniability invariant
// (I2: a price request must NEVER reveal what the user holds) is enforced
// STRUCTURALLY: no fetcher accepts a caller-supplied symbol list — each sources
// its `fsyms` from a fixed module constant below, so an outbound request is
// byte-identical for every user regardless of holdings/wallets/decoy state.
// `tsyms` (fiats) may be passed: fiat choice reveals nothing about holdings.
//
// Two fixed universes (both holdings-agnostic; see design 2026-06-17):
//   PORTFOLIO_SYMBOLS — the wallet's holdable assets, for portfolio USD valuation.
//   MARKET_SYMBOLS    — the top-coin market basket (= cryptos.js TOP_SYMBOLS), for
//                       the calculator / price-alert / 24h-change tools.
//
// I4 (fail closed): every fetcher throws on a non-OK response; callers fall back
// honestly (approximate / hide-the-delta) and never show stale-as-live.

import { ASSETS } from '@/wallet-core/assets.js';
import { TOP_SYMBOLS } from '@/lib/cryptos.js';

const BASE = 'https://min-api.cryptocompare.com/data';
const EXTRA = 'extraParams=safecryptowallet';

// Holdable assets (deduped) — the FULL registry, never narrowed to held assets.
export const PORTFOLIO_SYMBOLS = Object.freeze([...new Set(ASSETS.map((a) => a.symbol))]);
// Top-coin market basket — the canonical list already defined in cryptos.js.
export const MARKET_SYMBOLS = TOP_SYMBOLS;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cryptocompare HTTP ${res.status}`);
  return res.json();
}

// pricemulti raw → flat USD map for the given fixed `symbols`.
function toUsdMap(raw, symbols) {
  const out = {};
  for (const s of symbols) {
    const v = raw?.[s]?.USD;
    if (typeof v === 'number' && Number.isFinite(v)) out[s] = v;
  }
  return out;
}

/** USD prices for the PORTFOLIO universe → { [sym]: number }. */
export async function fetchPortfolioPricesUsd() {
  const raw = await getJson(`${BASE}/pricemulti?fsyms=${PORTFOLIO_SYMBOLS.join(',')}&tsyms=USD&${EXTRA}`);
  return toUsdMap(raw, PORTFOLIO_SYMBOLS);
}

/** USD prices for the MARKET universe → { [sym]: number }. */
export async function fetchMarketPricesUsd() {
  const raw = await getJson(`${BASE}/pricemulti?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=USD&${EXTRA}`);
  return toUsdMap(raw, MARKET_SYMBOLS);
}

/** Multi-fiat matrix for the MARKET universe → raw pricemulti shape { [sym]: { [fiat]: number } }. */
export async function fetchMarketPricesFiat(fiats) {
  const tsyms = (Array.isArray(fiats) ? fiats : [fiats]).join(',');
  return getJson(`${BASE}/pricemulti?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=${tsyms}&${EXTRA}`);
}

/** 24h % change for the MARKET universe (pricemultifull) → { [sym]: { change24h: number|null } }. */
export async function fetchMarketChanges24h() {
  const raw = await getJson(`${BASE}/pricemultifull?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=USD&${EXTRA}`);
  const RAW = raw?.RAW;
  if (!RAW) throw new Error('cryptocompare: no RAW payload');
  const out = {};
  for (const s of MARKET_SYMBOLS) {
    const cell = RAW[s]?.USD;
    out[s] = cell && Number.isFinite(cell.CHANGEPCT24HOUR) ? { change24h: cell.CHANGEPCT24HOUR } : { change24h: null };
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/cryptoCompare.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cryptoCompare.js src/lib/__tests__/cryptoCompare.test.js
git commit -m "feat(price-egress): single cryptoCompare module enforcing holdings-agnostic fetches"
```

---

## Task 2: Migrate `priceFeed.js` onto the module

**Files:**
- Modify: `src/lib/priceFeed.js`
- Test: `src/lib/__tests__/priceFeed.test.js` (must stay green; should not need edits)

- [ ] **Step 1: Delegate the fetch + source the symbol constant**

In `src/lib/priceFeed.js`:
- Add import: `import { fetchPortfolioPricesUsd, PORTFOLIO_SYMBOLS } from '@/lib/cryptoCompare.js';`
- Replace the `SUPPORTED_SYMBOLS` definition (currently `Object.freeze([...new Set(ASSETS.map((a) => a.symbol))])`) with a re-export for back-compat:
  ```js
  // Back-compat alias — the portfolio universe now lives in cryptoCompare.js.
  export const SUPPORTED_SYMBOLS = PORTFOLIO_SYMBOLS;
  ```
- Replace the body of `fetchLivePricesUsd` with a delegation:
  ```js
  export async function fetchLivePricesUsd() {
    return fetchPortfolioPricesUsd();
  }
  ```
- Remove the now-unused `import { ASSETS } from '@/wallet-core/assets.js';` IF nothing else in the file uses `ASSETS` (check first; the only use was the `SUPPORTED_SYMBOLS` definition).
- Leave `isLivePricesEnabled`/`setLivePricesEnabled`/`useLivePrices` and the opt-in `enabled`-gate UNCHANGED.

- [ ] **Step 2: Run the priceFeed suite**

Run: `npx vitest run src/lib/__tests__/priceFeed.test.js`
Expected: PASS unchanged — `SUPPORTED_SYMBOLS` still exported (now = `PORTFOLIO_SYMBOLS`, same membership); `fetchLivePricesUsd` still requests those symbols in USD and throws on non-OK (the test stubs `fetch`, which the delegated call still uses).

- [ ] **Step 3: Commit**

```bash
git add src/lib/priceFeed.js
git commit -m "refactor(price-egress): priceFeed delegates to cryptoCompare.fetchPortfolioPricesUsd"
```

---

## Task 3: Migrate the three market callers

**Files:**
- Modify: `src/hooks/useBasketPrices.js`
- Modify: `src/hooks/usePriceAlertNotifier.js`
- Modify: `src/pages/Calculator.jsx`

No unit tests for these (no React-render harness); verified by the full suite + `npm run build`. Each change is a fetch-delegation; the surrounding react-query/interval/parsing stays.

- [ ] **Step 1: `useBasketPrices.js` → `fetchMarketChanges24h`**

Replace the local `BASKET`/`PRICE_URL` consts and the `fetchBasket` body with a delegation. Add `import { fetchMarketChanges24h } from '@/lib/cryptoCompare.js';` and drop the `import { TOP_SYMBOLS } from '@/lib/cryptos';` plus the local URL/parse. The hook becomes:
```js
import { useQuery } from "@tanstack/react-query";
import { fetchMarketChanges24h } from "@/lib/cryptoCompare.js";

const CACHE_MS = 10 * 60 * 1000;

export function useBasketPrices() {
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchMarketChanges24h,
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
  const isLive = isSuccess && !isError && !!data;
  const changeFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.change24h;
    return Number.isFinite(v) ? v : null;
  };
  return { changeFor, isLive };
}
```
Keep the file's existing header comment (it documents the I2 invariant); update its wording only if it references the now-removed local URL. The returned shape (`{ [sym]: { change24h } }`) is identical to before, so `changeFor`/`isLive` are unchanged.

- [ ] **Step 2: `usePriceAlertNotifier.js` → `fetchMarketPricesUsd`**

Remove the top-level `const PRICE_URL = "...";` and add `import { fetchMarketPricesUsd } from '@/lib/cryptoCompare.js';`. In `pollAlerts`, replace:
```js
        const res = await fetch(PRICE_URL);
        const raw = await res.json();
        const current = {};
        for (const [coin, val] of Object.entries(raw)) current[coin] = val.USD;
```
with:
```js
        const current = await fetchMarketPricesUsd(); // { [coin]: usdNumber }, fixed MARKET_SYMBOLS
```
The rest of `pollAlerts` (volatility/target logic, `prevPricesRef`, `triggerAlert`, the 60s `setInterval`, the `try/catch`) is UNCHANGED. `current[c]` is still a USD number for each coin, so all downstream comparisons behave identically.

- [ ] **Step 3: `Calculator.jsx` → `fetchMarketPricesFiat` + drop local `CRYPTOS`**

In `src/pages/Calculator.jsx`:
- Add `import { fetchMarketPricesFiat, MARKET_SYMBOLS } from '@/lib/cryptoCompare.js';`
- Delete the local `const CRYPTOS = ["BTC", ...];` and replace its uses with `MARKET_SYMBOLS` (the dropdown list — identical 10 symbols, same order).
- Replace the `fetchPrices` function with a delegation that passes the page's `FIATS`:
  ```js
  const fetchPrices = () => fetchMarketPricesFiat(FIATS);
  ```
  (Keep `const FIATS = [...]` local — fiats are a display choice, not a symbol universe.) The `useQuery` (`queryKey: ["conversion-prices"]`, `refetchInterval: 30_000`, `staleTime: 20_000`) and the `prices?.[fromCrypto]?.[toFiat]` access are UNCHANGED — `fetchMarketPricesFiat` returns the same raw pricemulti matrix shape.

- [ ] **Step 4: Verify the whole thing builds + suite green**

Run: `npm run build`
Expected: exit 0 (all imports resolve; no dangling `CRYPTOS`/`PRICE_URL`/`TOP_SYMBOLS` references in the three files).
Run: `git grep -n "min-api.cryptocompare.com/data/price" src/ | grep -v "src/lib/cryptoCompare.js"`
Expected: NO price-endpoint URLs remain outside the module (the news endpoint in `CryptoNewsFeed.jsx` is `/data/v2/news/` and is correctly NOT matched).
Run: `npx vitest run`
Expected: PASS — new `cryptoCompare.test.js`, unchanged `priceFeed.test.js`, nothing regressed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBasketPrices.js src/hooks/usePriceAlertNotifier.js src/pages/Calculator.jsx
git commit -m "refactor(price-egress): migrate basket/alerts/calculator onto the cryptoCompare module"
```

---

## Final verification

- [ ] **Full suite + build**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build`
Expected: exit 0.

- [ ] **Egress is centralized (grep)**

Run: `git grep -n "cryptocompare.com/data/price" src/`
Expected: the ONLY hits are inside `src/lib/cryptoCompare.js`. (News `/data/v2/news/` stays in `CryptoNewsFeed.jsx`, out of scope.)

- [ ] **Optional dev smoke**

Open the Calculator (conversions still work, same coins/fiats), confirm the dashboard 24h-change chips still render, and that the portfolio live-price toggle still works. Network panel shows the same CryptoCompare requests as before (same symbols/endpoints), now all originating from the one module. Sanity check, not a gate.

---

## Notes / invariants honored

- **I2 / deniability:** the holdings-agnostic rule is now STRUCTURAL — no fetcher accepts a symbol list; each uses a fixed module constant. All four requests stay byte-identical-per-user, enforced in one auditable place.
- **No behavior change:** `MARKET_SYMBOLS = TOP_SYMBOLS` is byte-identical to the three market callers' prior lists; the portfolio path keeps its opt-in gate; all react-query keys/intervals/parsing preserved.
- **I4 / fail-honest:** every fetcher throws on non-OK; each caller's existing fail-closed handling is intact.
- **No new domain/endpoint:** same two CryptoCompare price paths already in use; the news endpoint is untouched and out of scope.
