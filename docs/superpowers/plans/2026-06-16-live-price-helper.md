# Shared Live-Price Helper + Honest Portfolio Total — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the portfolio total an honest USD basis — opt-in live prices (off by default, zero egress until enabled) injected through the central `portfolioBalances` aggregator, with the stale `USD_RATES` kept as a clearly-disclosed fallback.

**Architecture:** A new `lib/priceFeed.js` owns the opt-in pref + the holdings-agnostic CryptoCompare fetch + a react-query hook. `portfolioBalances.usdRate/computePortfolio/usePortfolio` gain an OPTIONAL live-price map (default-preserving) and surface a `priceBasis: 'live' | 'approx'`. The Dashboard total (`/`, already disclosed) shows a live/approximate indicator. Off by default ⇒ no network call (I2).

**Tech Stack:** JS (ESM), Vitest (mock `fetch`), react-query, existing `portfolioBalances.js` aggregator, CryptoCompare `pricemulti` endpoint (already used + disclosed by `Calculator.jsx`), Tailwind UI.

**Spec:** `docs/superpowers/specs/2026-06-16-live-price-helper-design.md`

**Base branch:** `claude/live-price-helper` off `main` (has #197 audit-log + #198 last-unlock). NetWorth promotion is SPLIT to a follow-on (it's honest-disabled at the route level — see spec §3.5).

---

## File Structure

- `src/lib/priceFeed.js` — **create.** Opt-in pref (`isLivePricesEnabled`/`setLivePricesEnabled`), `SUPPORTED_SYMBOLS` (from `ASSETS`), `fetchLivePricesUsd()` (holdings-agnostic), `useLivePrices()` hook.
- `src/lib/__tests__/priceFeed.test.js` — **create.** Pref, fetch (mocked), holdings-agnostic assertion.
- `src/lib/portfolioBalances.js` — **modify.** `usdRate(symbol, livePrices?)`, `computePortfolio(…, livePrices?)`, `usePortfolio` composes `useLivePrices` and returns `priceBasis` + live meta.
- `src/lib/__tests__/portfolioBalances.test.js` — **modify.** Add live-price-injection cases; existing tests stay green.
- `src/pages/Settings.jsx` — **modify.** "Live market prices" opt-in toggle + egress disclosure.
- `src/pages/WalletPortfolioPage.jsx` — **modify.** Live/approximate basis indicator + manual refresh on the total.
- `docs/Feature-Status.md` — **modify.** Record the live-price helper as BUILT.

---

## Task 1: `lib/priceFeed.js` — opt-in pref + holdings-agnostic live fetch

**Files:**
- Create: `src/lib/priceFeed.js`
- Test: `src/lib/__tests__/priceFeed.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/priceFeed.test.js`:

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LIVE_PRICE_PREF_KEY, isLivePricesEnabled, setLivePricesEnabled,
  SUPPORTED_SYMBOLS, fetchLivePricesUsd,
} from '../priceFeed.js';

describe('live-prices opt-in pref', () => {
  beforeEach(() => { try { localStorage.removeItem(LIVE_PRICE_PREF_KEY); } catch { /* noop */ } });

  it('is OFF by default (absence = off) and toggles', () => {
    expect(isLivePricesEnabled()).toBe(false);
    setLivePricesEnabled(true);
    expect(isLivePricesEnabled()).toBe(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
    setLivePricesEnabled(false);
    expect(isLivePricesEnabled()).toBe(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull(); // off = ABSENT, no "0" tell
  });
});

describe('fetchLivePricesUsd — holdings-agnostic live fetch', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('requests the FULL fixed supported-symbol list (never holdings) in USD', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => Object.fromEntries(SUPPORTED_SYMBOLS.map((s) => [s, { USD: 10 }])),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchLivePricesUsd();
    const url = fetchMock.mock.calls[0][0];
    // Every supported symbol is requested — the request does not narrow to held assets.
    for (const s of SUPPORTED_SYMBOLS) expect(url).toContain(s);
    expect(url).toContain('tsyms=USD');
    // Parsed to a flat { symbol: number } USD map.
    expect(out.ETH).toBe(10);
    expect(Object.keys(out).sort()).toEqual([...SUPPORTED_SYMBOLS].sort());
  });

  it('throws on a non-OK HTTP response (caller treats as unavailable)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchLivePricesUsd()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/priceFeed.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/priceFeed.js`**

```js
// lib/priceFeed.js — OPT-IN live USD prices (OFF by default).
//
// I2 (no silent egress): no network call is ever made unless the user explicitly
// turns this on. When on, the request sends a FIXED, holdings-agnostic list of
// every supported symbol (never the user's enabled/held assets), so it can never
// be a holdings oracle. Generalizes the CryptoCompare usage already in
// Calculator.jsx / PriceAlerts (disclosed). USD-only here.
//
// I4 (fail closed): a failed fetch throws; callers fall back to the disclosed
// stale USD_RATES and label the figure approximate — never stale-as-live.

import { useQuery } from '@tanstack/react-query';
import { ASSETS } from '@/wallet-core/assets.js';

// localStorage opt-in pref. "1" = on / ABSENT = off (mirrors lib/biometric.js,
// wallet-core/auditLog.js). Absence = off is deliberate: a fresh device makes no
// price call. Device-global and holdings-blind — reveals nothing about holdings.
export const LIVE_PRICE_PREF_KEY = 'veyrnox-live-prices';

/** @returns {boolean} whether the user opted into live prices. */
export function isLivePricesEnabled() {
  try { return localStorage.getItem(LIVE_PRICE_PREF_KEY) === '1'; }
  catch { return false; } // storage unavailable → treat as OFF (no egress)
}

/** Persist the opt-in. OFF is stored as ABSENCE of the key (no lingering tell). */
export function setLivePricesEnabled(on) {
  try {
    if (on) localStorage.setItem(LIVE_PRICE_PREF_KEY, '1');
    else localStorage.removeItem(LIVE_PRICE_PREF_KEY);
  } catch { /* best-effort */ }
}

// The FIXED request set: every supported asset symbol, holdings-agnostic. Derived
// from the asset registry, deduped. The request is ALWAYS this full list, so it
// never narrows to what the user holds (no oracle).
export const SUPPORTED_SYMBOLS = Object.freeze([...new Set(ASSETS.map((a) => a.symbol))]);

/**
 * Fetch current USD prices for the full supported-symbol list. Returns a flat
 * { [symbol]: number } map. Throws on network / non-OK HTTP (the caller treats a
 * throw as "live unavailable" and falls back to the disclosed stale rates).
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchLivePricesUsd() {
  const fsyms = SUPPORTED_SYMBOLS.join(',');
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms}&tsyms=USD&extraParams=safecryptowallet`,
  );
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`);
  const data = await res.json(); // { ETH: { USD: 3200 }, ... }
  const out = {};
  for (const s of SUPPORTED_SYMBOLS) {
    const v = data?.[s]?.USD;
    if (typeof v === 'number' && Number.isFinite(v)) out[s] = v;
  }
  return out;
}

/**
 * React hook: live USD prices, ONLY when opted in (enabled-gated ⇒ no fetch, no
 * egress when off). Conservative caching to minimize egress even when on. Returns
 * react-query's shape plus a stable `updatedAt`.
 */
export function useLivePrices() {
  const enabled = isLivePricesEnabled();
  const q = useQuery({
    queryKey: ['live-prices-usd'],
    queryFn: fetchLivePricesUsd,
    enabled,                 // OFF ⇒ query never runs ⇒ zero network call (I2)
    staleTime: 5 * 60_000,   // 5 min; no aggressive refetchInterval (privacy)
    retry: 1,
  });
  return {
    prices: q.data ?? null,
    isLoading: q.isLoading && enabled,
    isError: q.isError,
    updatedAt: q.dataUpdatedAt || null,
    refetch: q.refetch,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/priceFeed.test.js`
Expected: PASS (3 assertions/tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceFeed.js src/lib/__tests__/priceFeed.test.js
git commit -m "feat(live-prices): opt-in holdings-agnostic live USD price helper (off by default)"
```

---

## Task 2: Inject live prices into `portfolioBalances.js`

**Files:**
- Modify: `src/lib/portfolioBalances.js`
- Test: `src/lib/__tests__/portfolioBalances.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/portfolioBalances.test.js` (it already imports `usdRate`, `computePortfolio`, and mocks the providers):

```js
describe('live-price injection (optional, default-preserving)', () => {
  it('usdRate uses the live map when given, else falls back to USD_RATES', () => {
    const fallback = usdRate('ETH');               // existing one-arg behaviour
    expect(usdRate('ETH', { ETH: 4242 })).toBe(4242);
    expect(usdRate('ETH', {})).toBe(fallback);     // empty map → fallback
    expect(usdRate('ETH', undefined)).toBe(fallback);
  });

  it('computePortfolio applies the live map to USD when provided', async () => {
    getBalanceEth.mockResolvedValue(2);
    const live = { ETH: 1000 };
    const { byWallet, grandTotal } = await computePortfolio(
      [{ id: 'w1', enabledAssets: ['ETH'] }],
      { w1: { evm: '0xabc' } },
      live,
    );
    expect(byWallet.w1.assets[0].usd).toBe(2000); // 2 ETH * $1000 live
    expect(grandTotal).toBe(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/portfolioBalances.test.js -t "live-price injection"`
Expected: FAIL — `usdRate`/`computePortfolio` ignore the second/third argument.

- [ ] **Step 3: Implement in `portfolioBalances.js`**

(a) `usdRate` — add an optional `livePrices` argument; use it when it carries a finite number for the symbol, else the existing fallback:

```js
export function usdRate(symbol, livePrices) {
  const live = livePrices && livePrices[symbol];
  if (typeof live === 'number' && Number.isFinite(live)) return live;
  return USD_RATES[symbol] ?? (symbol === 'USDC' || symbol === 'USDT' ? 1 : 0);
}
```

(b) `computePortfolio` — accept `livePrices` and pass it to the one `usdRate` call:

```js
export async function computePortfolio(wallets, walletAddresses, livePrices) {
```
and the usd line inside the results loop becomes:
```js
    const usd = indeterminate ? null : amount * usdRate(symbol, livePrices);
```

(c) `usePortfolio` — compose the live-prices hook, decide `liveOk`, pass the map into the query, and return `priceBasis` + live meta. Add the import at the top of the file:
```js
import { useLivePrices } from '@/lib/priceFeed.js';
```
Replace the `usePortfolio` body with:
```js
export function usePortfolio(wallets, walletAddresses) {
  const enabled = Array.isArray(wallets) && wallets.length > 0;
  const { prices, isError, updatedAt, refetch: refetchPrices } = useLivePrices();
  // Live basis only when opted-in AND the fetch produced prices without error.
  const liveOk = prices != null && !isError;
  const livePrices = liveOk ? prices : undefined;
  const query = useQuery({
    // Key includes a live/approx marker so flipping the basis refetches the total.
    queryKey: ['portfolio', liveOk ? 'live' : 'approx', portfolioKey(wallets || [], walletAddresses || {})],
    queryFn: () => computePortfolio(wallets, walletAddresses || {}, livePrices),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  return { ...query, priceBasis: liveOk ? 'live' : 'approx', pricesUpdatedAt: updatedAt, refetchPrices };
}
```

- [ ] **Step 4: Run the full portfolioBalances suite to verify**

Run: `npx vitest run src/lib/__tests__/portfolioBalances.test.js`
Expected: PASS — the new live-injection tests AND all existing tests (the one-arg `usdRate('ETH')` calls still resolve to the fallback, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolioBalances.js src/lib/__tests__/portfolioBalances.test.js
git commit -m "feat(live-prices): inject optional live prices into the portfolio aggregator (priceBasis)"
```

---

## Task 3: Settings — "Live market prices" opt-in toggle + disclosure

**Files:**
- Modify: `src/pages/Settings.jsx`

No unit test (no React harness); verified by the suite staying green + `npm run build`.

- [ ] **Step 1: Add imports + local state**

`src/pages/Settings.jsx` already imports `useState` from "react" (line 1). Add ONE new import near the other `@/lib` imports:
```js
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
```

Inside the `Settings()` component body, near the other `useState` hooks (e.g. by `const [showDelete, setShowDelete] = useState(false);`), add:
```js
  const [livePrices, setLivePrices] = useState(() => isLivePricesEnabled());
```

- [ ] **Step 2: Add the toggle card**

Immediately AFTER the appearance/theme toggle card (the `<div>` block that ends right before the `{/* Biometric unlock ... */}` comment, around line 95), insert:

```jsx
      {/* Live market prices (OPT-IN, off by default — I2 no silent egress) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Live market prices</p>
              <p className="text-xs text-muted-foreground">Off by default · USD values use reference rates until enabled</p>
            </div>
          </div>
          <Switch
            checked={livePrices}
            onCheckedChange={(checked) => { setLivePricesEnabled(checked); setLivePrices(checked); recordAudit('settings_changed'); }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          When on, your wallet fetches current prices from CryptoCompare. The request sends only a fixed list
          of supported coins — never your holdings, balances, or addresses. Off by default; no price calls are
          made until you turn this on.
        </p>
      </div>
```

Add `TrendingUp` to the existing `lucide-react` import line in `Settings.jsx` (it imports `Shield, Fingerprint, Sun, Moon, …` — append `TrendingUp` there; do not add a second import). `Switch` and `recordAudit` are already in scope (the theme toggle uses both).

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds, no import/JSX errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(live-prices): opt-in Live market prices toggle + egress disclosure in Settings"
```

---

## Task 4: WalletPortfolioPage — honest live/approximate basis indicator

**Files:**
- Modify: `src/pages/WalletPortfolioPage.jsx`

- [ ] **Step 1: Surface the basis from `usePortfolio`**

`usePortfolio` is destructured at `src/pages/WalletPortfolioPage.jsx:381` as
`const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(wallets, walletAddresses);`.
Extend it to capture the new fields:
```js
  const { data: portfolio, isLoading: portfolioLoading, priceBasis, pricesUpdatedAt, refetchPrices } = usePortfolio(wallets, walletAddresses);
```

- [ ] **Step 2: Add a small helper + the indicator near the total**

Near the top of the file (with the other small helpers, e.g. by the `n == null ? "—"` formatter around line 39), add:
```js
// "12:04" local time for the live-price freshness stamp.
const fmtPriceTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
```

The total currently renders an incompleteness marker at line ~447 (`{data.indeterminate && <span … · partial</span>}`). Immediately AFTER that span, add a price-basis indicator:
```jsx
                {priceBasis === 'live' ? (
                  <button
                    type="button"
                    onClick={() => refetchPrices?.()}
                    className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    title="Refresh live prices"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Live{pricesUpdatedAt ? ` · ${fmtPriceTime(pricesUpdatedAt)}` : ''}
                  </button>
                ) : (
                  <span className="ml-2 text-[10px] text-muted-foreground">Approximate</span>
                )}
```

Add `RefreshCw` to the existing `lucide-react` import block in this file (it already imports a set of icons inside `import { … } from "lucide-react"` — append `RefreshCw`; do not add a second import). The existing `<ReferenceRateNote />` at line ~520 stays — it already discloses WHY the approximate figure is approximate.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds.
Run: `npx vitest run src/lib/__tests__/usdDisclosure.test.js`
Expected: PASS — `/` is already `{discloses:true}` and the page still renders `ReferenceRateNote`, so the guard stays satisfied.

- [ ] **Step 4: Commit**

```bash
git add src/pages/WalletPortfolioPage.jsx
git commit -m "feat(live-prices): show live/approximate price basis + refresh on the portfolio total"
```

---

## Task 5: Update Feature-Status doc

**Files:**
- Modify: `docs/Feature-Status.md`

- [ ] **Step 1: Add a line under §10 (niceties / utilities)**

In `docs/Feature-Status.md`, under the "## 10. Niceties / analytics / utilities" section, add:
```
- Live market prices (opt-in) — 🟡 BUILT / UNAUDITED-PROVISIONAL. `lib/priceFeed.js`: OFF by default
  (I2 — no price egress until enabled), holdings-agnostic request (fixed full symbol list, never holdings),
  injected through `portfolioBalances` so the portfolio total shows a live USD figure ("Live · HH:MM" +
  refresh) when on, or the disclosed-approximate `USD_RATES` reference rate when off/unavailable (I4 — never
  stale-as-live). Wired into the Dashboard total only; NetWorth promotion (honest-disabled → live) is a
  separate follow-on. See `docs/superpowers/specs/2026-06-16-live-price-helper-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/Feature-Status.md
git commit -m "docs(live-prices): record opt-in live-price helper as BUILT"
```

---

## Final verification

- [ ] **Full suite + build**

Run: `npx vitest run`
Expected: PASS — new `priceFeed.test.js`, extended `portfolioBalances.test.js`, and `usdDisclosure.test.js` all green; nothing regressed.
Run: `npm run build`
Expected: exit 0.

(If running vitest in this worktree fails to resolve `fake-indexeddb` under `/@fs`, that is the known worktree-config quirk — CI runs a full checkout where it resolves. The `priceFeed`/`portfolioBalances` test files do not need IndexedDB and can be run individually.)

- [ ] **Optional dev smoke**

In dev: with the toggle OFF, the portfolio total shows "Approximate" + the ReferenceRateNote (no network call — confirm no CryptoCompare request in the network panel). Turn the Settings toggle ON → the total switches to "Live · HH:MM", and exactly one holdings-agnostic `pricemulti?fsyms=…` request appears (the fsyms list is the full supported set, not your enabled assets). This is a sanity check, not a gate.

---

## Notes / invariants honored

- **I2 (no silent egress):** off by default; `useLivePrices` is `enabled`-gated ⇒ zero fetch when off; enabling is explicit + disclosed in Settings.
- **I3 / deniability:** the request is holdings-agnostic (`SUPPORTED_SYMBOLS`, never enabled/held assets); `portfolioBalances` already has no `isDecoy` branch; the pref is device-global and holdings-blind — no oracle.
- **I4 fail-closed / no fake security:** a failed/disabled live fetch falls back to the disclosed approximate `USD_RATES`, labeled "Approximate" — never stale-as-live; the existing `indeterminate` handling is untouched.
- **Disclosure guard:** `/` stays `{discloses:true}` and keeps `ReferenceRateNote`; `usdDisclosure.test.js` stays green. No new disclosure entry needed.
- **Honest status:** BUILT / UNAUDITED-PROVISIONAL; testnet; no on-chain artifact → not "verified".
