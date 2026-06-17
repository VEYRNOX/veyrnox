# Watchlist — wire to real price data (Salvage Tier 1)

> Status: design approved 2026-06-17. Salvage-roadmap Tier 1 quick-wire.
> Replaces the Watchlist's fabricated price display with the app's existing
> opt-in, holdings-blind price feeds, or an honest disabled state when off.

## Problem

The Watchlist (`/watchlist`) and its Dashboard widget render **fabricated data
as real**:

- `src/pages/WatchlistPage.jsx` and `src/components/WatchlistWidget.jsx` both
  build a `MOCK_PRICES` map from `TOP_CRYPTOS` — **static reference prices and a
  static `change24h`** displayed as if they were live.
- The page additionally **synthesizes 24h high/low at ±4%** around the static
  price (`high: usd*1.04`, `low: usd*0.96`) — pure fabrication.

This violates the Salvage-roadmap guardrail: *"Never re-introduce
fabricated-data-as-real to fill a feature. Honest-disable until real."*

### What is already real (and stays untouched)

- **Persistence.** `base44.entities.PersonalWatchlist` (add / edit / delete,
  `target_buy` / `target_sell`, `note`) is backed by the on-device `localClient`
  — local-first, no backend. The CRUD is genuine.
- **Two honest price sources already exist in-app**, both holdings-blind and
  fail-honest:
  - `src/lib/priceFeed.js` → `useLivePrices()` — **opt-in** (OFF by default, I2)
    USD **spot price** for `SUPPORTED_SYMBOLS` (the wallet asset registry).
    Gated on the Settings "live prices" toggle (`LIVE_PRICE_PREF_KEY`,
    `isLivePricesEnabled()`).
  - `src/hooks/useBasketPrices.js` → `useBasketPrices()` — real **24h change %**
    (`CHANGEPCT24HOUR` via cryptocompare `pricemultifull`) for `TOP_SYMBOLS`,
    holdings-decoupled (byte-identical request for every user).

So the fix is narrow: swap the mock for these real feeds and handle the
off/unavailable state honestly. No new provider, no new endpoint, no new
privacy/address-leak decision.

## Decisions (from brainstorming)

1. **24h High/Low → make it real.** The `pricemultifull` response already
   contains `HIGH24HOUR` / `LOW24HOUR` in the same RAW payload as
   `CHANGEPCT24HOUR`. Extend `useBasketPrices` to surface them — no new request.
2. **Off / unavailable → honest-disabled prompt.** When live prices are OFF (the
   default) or the feed fails, show NO price/change/H-L — never a fabricated or
   stale figure.
3. **Opt-in gating scope → watchlist only.** Add an optional `enabled` param to
   `useBasketPrices` (default `true`, preserving current behavior). The Watchlist
   passes `enabled = isLivePricesEnabled()` so "prices off" means zero egress
   (I2). **TokenList is unchanged** — the app-wide gating question is deliberately
   deferred, not decided here.
4. **Compact widget drops H/L.** `WatchlistWidget` shows price + change only
   (no high/low row); the full page shows price + change + H/L.

## Design

### 1. `src/hooks/useBasketPrices.js` (extend, non-breaking)

- In `fetchBasket`, additionally read `cell.HIGH24HOUR` / `cell.LOW24HOUR` per
  symbol and store them next to `change24h`. Each is kept only when finite;
  missing → `null` (fail-honest, same rule as the existing change value).
- Add an `enabled` option: `useBasketPrices({ enabled = true } = {})`. Pass
  `enabled` straight to the react-query `enabled` field so `enabled: false` ⇒ no
  fetch, no egress. Default `true` keeps every current caller (TokenList)
  byte-for-byte unchanged.
- Return shape (additive):
  - `changeFor(symbol)` — finite 24h % when live, else `null` (unchanged).
  - `highLowFor(symbol)` — `{ high, low }` with finite values or `null` each,
    when live; `null` when not live.
  - `isLive` — `isSuccess && !isError && !!data` AND the query was enabled.

Coverage note: the basket covers `TOP_SYMBOLS`; spot covers `SUPPORTED_SYMBOLS`.
A watchlist symbol present in one list but not the other shows whatever is
genuinely available and omits the rest. Each field is independent.

### 2. `src/pages/WatchlistPage.jsx`

- Delete `MOCK_PRICES`.
- `const liveOn = isLivePricesEnabled();`
- `const { prices, isError: spotError } = useLivePrices();`
- `const { changeFor, highLowFor, isLive } = useBasketPrices({ enabled: liveOn });`
- Per row, derive (all honest, no fabrication):
  - `price = liveOn ? prices?.[symbol] ?? null : null`
  - `change = changeFor(symbol)` (null when off/unavailable)
  - `hl = highLowFor(symbol)` (null when off/unavailable)
- Rendering states per row:
  - **liveOn === false:** symbol, note, targets, and an inline
    "Turn on live prices in Settings" prompt. No price/change/H-L.
  - **liveOn && price == null:** "price unavailable" for that row (fetch failed
    or symbol not in feed). No stale number.
  - **liveOn && price != null:** real price; render change chip only when
    `change != null`; render H/L line only when `hl` present.
- **Target badges:** `atBuy` / `atSell` evaluate ONLY when `price != null` (a
  real live price). When price is null, no badge and no border highlight.
- Header subtitle may note basis honestly (e.g. "Live" when on, plain count when
  off) — reuse existing copy patterns; no new claims.

### 3. `src/components/WatchlistWidget.jsx`

- Delete `MOCK_PRICES`.
- Same `liveOn` / `useLivePrices` / `useBasketPrices({ enabled: liveOn })` wiring.
- Price + change only (no H/L). Off → compact "Live prices off" hint (or reuse the
  empty/idle copy pattern). Unavailable per row → no number.

### 4. Tests

`src/hooks/__tests__/useBasketPrices.test.js` (new or extended):
- `HIGH24HOUR` / `LOW24HOUR` extraction → `highLowFor` returns finite values.
- Missing/non-finite high/low → `highLowFor` field is `null` (fail-honest).
- `enabled: false` ⇒ query disabled, no fetch (mock `fetch` asserted not called),
  `isLive === false`, `changeFor`/`highLowFor` return null.
- Existing change-extraction behavior unchanged with default `enabled`.

## Non-goals (YAGNI)

- No new data provider / endpoint; reuse the disclosed opt-in feeds only.
- No change to TokenList's posture (app-wide opt-in gating deferred).
- No change to watchlist persistence, add/edit/delete, targets, or notes.
- No 24h H/L in the compact widget.

## Verification

- `npm test` green (includes the new useBasketPrices cases).
- Run the app:
  - Live prices OFF (default): rows show the honest prompt, no prices; browser
    DevTools Network shows **no** request to `min-api.cryptocompare.com` from the
    Watchlist.
  - Toggle live prices ON in Settings: real spot price, real 24h change %, real
    24h H/L appear; a Buy/Sell-target badge lights only against the live price.

## Honest status framing (post-merge)

This is a UI data-wire with no on-chain artifact, so it is **not** a catalogue
"verified" promotion. When merged, the Watchlist graduates from
fabricated-shell to a real, opt-in feature; update `docs/Feature-Status.md`
(§10 niceties) to reflect "Watchlist — wired to opt-in live feed" only after the
code lands and the off/on behavior is confirmed by hand.

## Related

- `docs/Salvage-roadmap.md` — Tier 1 quick wires.
- `docs/superpowers/specs/2026-06-16-live-price-helper-design.md` — the opt-in
  `priceFeed.js` posture this reuses.
- `docs/Feature-Status.md` §10 — status to update on merge.
