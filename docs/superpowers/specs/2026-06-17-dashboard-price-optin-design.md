# Design: No third-party market egress on by default

**Date:** 2026-06-17
**Status:** DESIGN — pre-implementation. Privacy hardening (I2). On build: **BUILT / UNAUDITED-PROVISIONAL**
(testnet; behavior-preserving for opted-in users / users with alerts).
**Owner:** Al
**Cross-refs:** `src/lib/priceFeed.js` (#200 `isLivePricesEnabled` opt-in), `src/lib/cryptoCompare.js` (#209
egress module), `src/hooks/usePriceAlertNotifier.js`, `src/hooks/useBasketPrices.js`,
`src/components/Layout.jsx` (mounts the notifier), `src/components/TokenList.jsx` (consumes the basket).

---

## 1. Problem

Two market-data sources phone CryptoCompare **on by default**, before any user opt-in:
- `usePriceAlertNotifier` is mounted globally in `Layout.jsx`, so it polls every 60s app-wide — and it
  **fetches the price feed even when the user has zero price alerts** (it fetches first, then reads the
  alert list). A fresh user who never set an alert still leaks a 60s heartbeat to a third party.
- `useBasketPrices` (via `TokenList`, the dashboard 24h-change chips) fetches every 10 min regardless of the
  live-prices opt-in.

For a privacy-first, coercion-resistant wallet whose portfolio price path is carefully opt-in (#200), this
is an egress-by-default gap on the main screen.

## 2. Settled decision (brainstorming, 2026-06-17)

**Two targeted gates** (chosen over "one switch gates everything" and "fix only the notifier"):
1. **Alert notifier:** poll ONLY when ≥1 active alert exists — check the local alert list first, no fetch
   otherwise. Fixes the zero-alert heartbeat without breaking alerts for users who set them.
2. **Basket 24h chips:** gate on the existing `isLivePricesEnabled` opt-in (off by default).

Result: a fresh/opted-out user with no alerts makes **zero** CryptoCompare calls; alerts still work when set;
24h chips appear when live-prices is on. Egress happens only when the user took an action implying consent.

## 3. Architecture

### 3.1 `src/hooks/usePriceAlertNotifier.js` — local-first poll
Reorder `pollAlerts` so the local IndexedDB alert read happens BEFORE any network fetch, with an early
return when there are no active alerts:
```js
const pollAlerts = async () => {
  try {
    const alerts = await base44.entities.PriceAlert.filter({ status: "active" });
    if (alerts.length === 0) return;        // nothing to check → no price egress
    const current = await fetchMarketPricesUsd();
    for (const alert of alerts) { /* …unchanged volatility/target logic… */ }
    prevPricesRef.current = current;
  } catch {}
};
```
The 60s `setInterval`, the `base44.PriceAlert.subscribe` real-time effect, `triggerAlert`, `prevPricesRef`,
and all alert-evaluation logic are UNCHANGED. `fetchMarketPricesUsd` (from #209) is unchanged.

### 3.2 `src/hooks/useBasketPrices.js` — gate on the opt-in
Add `enabled: isLivePricesEnabled()` to the `useQuery`:
```js
import { isLivePricesEnabled } from "@/lib/priceFeed.js";
// …
const { data, isError, isSuccess } = useQuery({
  queryKey: ["basket-prices"],
  queryFn: fetchMarketChanges24h,
  enabled: isLivePricesEnabled(),   // off by default ⇒ no egress
  staleTime: CACHE_MS, refetchInterval: CACHE_MS, retry: 1,
});
```
When off: the query never runs → `data` undefined → `isLive` false → `changeFor()` returns `null` →
`ChangeChip` renders its existing no-delta state (the same path used today when the fetch fails — I4). When
on: identical behavior to today. The pref is read at render time (same reactivity model as `useLivePrices`).

### 3.3 `src/pages/Settings.jsx` — precise disclosure (small)
The live-prices toggle disclosure currently says it "fetches current prices from CryptoCompare." Tweak the
wording to note it also covers the dashboard 24h-change chips, so the one toggle's scope is accurate.

## 4. Invariants

- **I2 (no silent egress):** fresh/opted-out + no alerts ⇒ zero CryptoCompare calls (dashboard and app-wide).
  Egress only on a consent-implying action (set an alert, opt into live prices, open a price tool).
- **No behavior change for opted-in users / users with alerts:** identical fetches, cadences, logic.
- **I4 / no fake security:** the basket's existing fail-honest `null`/no-delta path is reused for the
  gated-off state — never a fabricated delta.
- **Holdings-agnostic (unchanged):** all fetches still go through `cryptoCompare.js`'s fixed-symbol fetchers.

## 5. Out of scope

- `Calculator.jsx` / `PriceAlerts.jsx` — pages the user navigates to deliberately (price tools); egress
  there is expected and stays always-on.
- The `TokenList` stale-`USD_RATES` per-row USD figure (a separate, pre-existing concern).
- The portfolio price path and `cryptoCompare.js` (unchanged).

## 6. Testing

- No new unit tests: both are hooks/effects and the repo has no React render harness; the changes are a
  guard reorder and a one-line `enabled` gate. Verified by the full suite staying green + `npm run build`,
  plus a network-panel smoke: opted-out fresh user with no alerts shows zero CryptoCompare requests; setting
  an alert restores notifier polling; toggling live-prices on restores the 24h chips.
