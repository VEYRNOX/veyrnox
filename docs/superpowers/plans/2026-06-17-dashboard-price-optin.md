# No Market Egress On By Default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh/opted-out user with no price alerts produce ZERO CryptoCompare calls, by gating the two always-on, mounted-by-default market-egress sources — without changing behavior for users who opted into live prices or set an alert.

**Architecture:** Two small gates. (1) `usePriceAlertNotifier` reads the local active-alerts list BEFORE any fetch and early-returns when empty. (2) `useBasketPrices` adds `enabled: isLivePricesEnabled()` so the dashboard 24h chips don't fetch unless the user opted in. Plus a one-line Settings disclosure tweak.

**Tech Stack:** JS (ESM), react-query, the `isLivePricesEnabled` opt-in (#200), the `cryptoCompare` module (#209).

**Spec:** `docs/superpowers/specs/2026-06-17-dashboard-price-optin-design.md`

**Base branch:** `claude/dashboard-price-optin` off `main` (has #200 + #209).

No new unit tests — both targets are hooks/effects and the repo has no React render harness. Verified by the full suite staying green + `npm run build`.

---

## File Structure

- `src/hooks/usePriceAlertNotifier.js` — **modify.** Local-first poll (skip fetch when no active alerts).
- `src/hooks/useBasketPrices.js` — **modify.** Gate the query on `isLivePricesEnabled()`.
- `src/pages/Settings.jsx` — **modify.** One-line disclosure tweak (mention 24h changes).

---

## Task 1: `usePriceAlertNotifier` — local-first (no fetch when no alerts)

**Files:**
- Modify: `src/hooks/usePriceAlertNotifier.js`

- [ ] **Step 1: Reorder `pollAlerts`**

In `src/hooks/usePriceAlertNotifier.js`, the `pollAlerts` function currently fetches prices FIRST, then reads the alert list. Replace the head of the function (the current lines from `const current = await fetchMarketPricesUsd();` down through `const alerts = await base44.entities.PriceAlert.filter({ status: "active" });`) so the local alert read comes first with an early return. The exact current head is:

```js
    const pollAlerts = async () => {
      try {
        const current = await fetchMarketPricesUsd(); // { [coin]: usdNumber }, fixed MARKET_SYMBOLS

        const prev = prevPricesRef.current;
        const alerts = await base44.entities.PriceAlert.filter({ status: "active" });

        for (const alert of alerts) {
```

Change it to:

```js
    const pollAlerts = async () => {
      try {
        // Local-first: read the active alerts (local IndexedDB) BEFORE any
        // network call. No active alerts ⇒ nothing to evaluate ⇒ NO price
        // egress (I2: no third-party heartbeat for a user who set no alerts).
        const alerts = await base44.entities.PriceAlert.filter({ status: "active" });
        if (alerts.length === 0) return;

        const current = await fetchMarketPricesUsd(); // { [coin]: usdNumber }, fixed MARKET_SYMBOLS
        const prev = prevPricesRef.current;

        for (const alert of alerts) {
```

Everything else in `pollAlerts` (the `for` loop body, the volatility/target logic, `sendNotification`, `triggerAlert`, the trailing `prevPricesRef.current = current;` and `catch {}`), the 60s `setInterval`, and the `base44.entities.PriceAlert.subscribe` real-time effect are UNCHANGED.

- [ ] **Step 2: Verify build + suite**

Run: `npm run build`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS (nothing regressed; no test covers this hook directly).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePriceAlertNotifier.js
git commit -m "feat(price-egress): price-alert notifier polls only when an active alert exists (no egress otherwise)"
```

---

## Task 2: `useBasketPrices` opt-in gate + Settings disclosure

**Files:**
- Modify: `src/hooks/useBasketPrices.js`
- Modify: `src/pages/Settings.jsx`

- [ ] **Step 1: Gate the basket query on the live-prices opt-in**

In `src/hooks/useBasketPrices.js`:
- Add the import: `import { isLivePricesEnabled } from "@/lib/priceFeed.js";`
- Add `enabled: isLivePricesEnabled(),` to the `useQuery` options. The block becomes:
```js
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchMarketChanges24h,
    enabled: isLivePricesEnabled(),   // off by default ⇒ no 24h-change egress
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
```
Leave `isLive`/`changeFor` unchanged — when the query is disabled, `data` is undefined ⇒ `isSuccess` false ⇒ `isLive` false ⇒ `changeFor()` returns `null` ⇒ `ChangeChip` renders its existing no-delta state (the same path used today when the fetch fails).

Optionally update the file's `FAIL-HONEST (I4)` header comment to add one sentence noting the feed is also gated on the live-prices opt-in (off by default). (Wording only — not required for correctness.)

- [ ] **Step 2: Tweak the Settings disclosure (one line)**

In `src/pages/Settings.jsx`, the live-prices disclosure paragraph reads (around line 117):
```
When on, your wallet fetches current prices from CryptoCompare. The request sends only a fixed list
```
Change `fetches current prices from CryptoCompare` to `fetches current prices and 24h changes from CryptoCompare` so the single toggle's scope is accurate (it now also gates the dashboard 24h-change chips). Change only that clause; leave the rest of the paragraph as is.

- [ ] **Step 3: Verify build + suite**

Run: `npm run build`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBasketPrices.js src/pages/Settings.jsx
git commit -m "feat(price-egress): gate dashboard 24h-change chips on the live-prices opt-in"
```

---

## Final verification

- [ ] **Full suite + build**

Run: `npx vitest run`
Expected: PASS — nothing regressed.
Run: `npm run build`
Expected: exit 0.

- [ ] **Optional dev smoke (manual)**

Fresh/opted-out session with no price alerts: open the dashboard and wait — the network panel shows **zero** `min-api.cryptocompare.com` requests (no notifier poll, no basket fetch). Then: set a price alert → the 60s notifier poll appears; separately, toggle "Live market prices" on in Settings → the 24h-change chips appear and the basket fetch runs. Sanity check, not a gate.

---

## Notes / invariants honored

- **I2 (no silent egress):** the two by-default egress sources are gated; a consent-implying action (set an alert, opt into live prices, or open a price tool) is now required before any CryptoCompare call.
- **No behavior change for opted-in users / users with alerts:** identical fetches, cadences, and alert logic — only the *order* (alerts-before-fetch) and the *enabled* flag changed.
- **I4 / no fake security:** the basket's existing fail-honest `null`/no-delta path is reused for the gated-off state; no fabricated 24h delta.
- **Holdings-agnostic (unchanged):** all fetches still go through `cryptoCompare.js`'s fixed-symbol fetchers.
- **Out of scope:** Calculator / PriceAlerts pages (deliberately-navigated price tools stay always-on), the portfolio path, `cryptoCompare.js`.
