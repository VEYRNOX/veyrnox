# Watchlist Real Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Watchlist's fabricated price display (static `MOCK_PRICES` + synthesized ±4% high/low shown as live) with the app's real, opt-in, holdings-blind price feeds — or an honest disabled state when off.

**Architecture:** Extend `useBasketPrices` (non-breaking) to also surface real 24h high/low and to accept an `enabled` opt-in gate, then rewire `WatchlistPage` and `WatchlistWidget` to consume `useLivePrices()` (spot) + `useBasketPrices({ enabled })` (change + H/L). When live prices are OFF (default) or a fetch fails, render no price/change/H-L — never a fabricated or stale figure. Persistence/CRUD is already real and untouched.

**Tech Stack:** React, @tanstack/react-query, vitest (jsdom), cryptocompare `pricemultifull` (already in use). No new dependency.

**Spec:** `docs/superpowers/specs/2026-06-17-watchlist-real-prices-design.md`

---

## File Structure

- **Modify** `src/hooks/useBasketPrices.js` — extract a pure `parseBasket(raw)`, add real `HIGH24HOUR`/`LOW24HOUR`, add optional `enabled` param + `highLowFor(symbol)`. Default `enabled = true` keeps TokenList unchanged.
- **Create** `src/hooks/__tests__/useBasketPrices.test.js` — unit tests for `parseBasket` (extraction + fail-honest nulls).
- **Modify** `src/pages/WatchlistPage.jsx` — delete `MOCK_PRICES`; consume the real feeds; honest off/unavailable states; real H/L; target badges only against a live price.
- **Modify** `src/components/WatchlistWidget.jsx` — same swap, price + change only (no H/L).

Test convention note: this repo has no component-test harness and no `@testing-library/react`/`renderHook` (see `src/lib/__tests__/priceFeed.test.js` — it unit-tests pure functions and leaves hook/opt-in no-fetch behavior to manual verification). This plan follows that pattern: unit-test the pure `parseBasket`; verify the `enabled`-gated no-egress behavior and the UI states by hand.

---

## Task 1: Extend `useBasketPrices` (real H/L + opt-in gate)

**Files:**
- Modify: `src/hooks/useBasketPrices.js`
- Test: `src/hooks/__tests__/useBasketPrices.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useBasketPrices.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseBasket } from '../useBasketPrices.js';
import { TOP_SYMBOLS } from '@/lib/cryptos';

describe('parseBasket — pricemultifull RAW extraction', () => {
  it('extracts finite change / high / low per symbol', () => {
    const raw = { RAW: { BTC: { USD: { CHANGEPCT24HOUR: 2.5, HIGH24HOUR: 70000, LOW24HOUR: 66000 } } } };
    expect(parseBasket(raw).BTC).toEqual({ change24h: 2.5, high24h: 70000, low24h: 66000 });
  });

  it('maps missing / non-finite fields to null (fail-honest)', () => {
    const raw = { RAW: { ETH: { USD: { CHANGEPCT24HOUR: 'x', HIGH24HOUR: null } } } };
    expect(parseBasket(raw).ETH).toEqual({ change24h: null, high24h: null, low24h: null });
  });

  it('includes every TOP_SYMBOL even when absent from the payload', () => {
    const out = parseBasket({ RAW: {} });
    for (const s of TOP_SYMBOLS) {
      expect(out[s]).toEqual({ change24h: null, high24h: null, low24h: null });
    }
  });

  it('throws when the RAW payload is missing (caller treats as not-live)', () => {
    expect(() => parseBasket({})).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useBasketPrices.test.js`
Expected: FAIL — `parseBasket` is not exported from `../useBasketPrices.js` (import error / undefined).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/hooks/useBasketPrices.js` with:

```js
import { useQuery } from "@tanstack/react-query";
import { TOP_SYMBOLS } from "@/lib/cryptos";

// ── Fixed-basket 24h market feed (HOLDINGS-DECOUPLED). ────────────────────────
//
// SECURITY (I2 — no holdings leak): this fetch ALWAYS requests ALL of
// TOP_SYMBOLS, same order, regardless of which assets the user holds, how many
// wallets exist, or real/decoy/empty state. The outbound request is therefore
// byte-identical for every user and every build (demo or real), so network
// traffic reveals nothing about holdings. NEVER narrow `fsyms` to owned assets.
//
// OPT-IN (I2 — no egress until enabled): callers may pass { enabled: false } to
// suppress the fetch entirely (e.g. the Watchlist when the user has not opted
// into live prices). Default `true` preserves the original always-on behavior
// for existing callers (TokenList).
//
// Same domain/provider as the existing price-alert feed; the `pricemultifull`
// endpoint adds CHANGEPCT24HOUR + HIGH24HOUR + LOW24HOUR for the same basket.
// No new domain, no new fingerprint.
//
// FAIL-HONEST (I4): on any failure isLive is false and every accessor returns
// null. Callers MUST hide the figure when not live — a stale number must never
// be shown as a live value.

const BASKET = TOP_SYMBOLS.join(",");
const PRICE_URL =
  "https://min-api.cryptocompare.com/data/pricemultifull" +
  `?fsyms=${BASKET}&tsyms=USD&extraParams=safecryptowallet`;

const CACHE_MS = 10 * 60 * 1000; // constant cadence, not user-triggered

// Pure: parse the cryptocompare pricemultifull payload into a per-symbol
// { change24h, high24h, low24h } map. Each field is kept only when finite, else
// null (fail-honest — a missing/garbage value must never render). Throws when
// the RAW payload is absent so the caller treats the whole basket as not-live.
export function parseBasket(raw) {
  const RAW = raw?.RAW;
  if (!RAW) throw new Error("basket: no RAW payload");
  const fin = (v) => (Number.isFinite(v) ? v : null);
  const out = {};
  for (const sym of TOP_SYMBOLS) {
    const cell = RAW[sym]?.USD;
    out[sym] = {
      change24h: cell ? fin(cell.CHANGEPCT24HOUR) : null,
      high24h: cell ? fin(cell.HIGH24HOUR) : null,
      low24h: cell ? fin(cell.LOW24HOUR) : null,
    };
  }
  return out;
}

async function fetchBasket() {
  const res = await fetch(PRICE_URL);
  if (!res.ok) throw new Error(`basket fetch ${res.status}`);
  return parseBasket(await res.json());
}

/**
 * Returns { changeFor, highLowFor, isLive }.
 * - changeFor(symbol): finite 24h % when live, else null.
 * - highLowFor(symbol): { high, low } (each finite or null) when live and at
 *   least one is present, else null.
 * - isLive: enabled AND the query succeeded with data.
 * When isLive is false, callers must render NO figures.
 * @param {{ enabled?: boolean }} [opts]
 */
export function useBasketPrices({ enabled = true } = {}) {
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchBasket,
    enabled,                 // OFF ⇒ query never runs ⇒ zero network call (I2)
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
  // Gate on `enabled` so output flips to "not live" the instant a caller opts
  // out, even though react-query keeps cached data for ~gcTime (fail-honest).
  const isLive = enabled && isSuccess && !isError && !!data;
  const changeFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.change24h;
    return Number.isFinite(v) ? v : null;
  };
  const highLowFor = (symbol) => {
    if (!isLive) return null;
    const cell = data?.[symbol];
    if (!cell) return null;
    const high = Number.isFinite(cell.high24h) ? cell.high24h : null;
    const low = Number.isFinite(cell.low24h) ? cell.low24h : null;
    if (high == null && low == null) return null;
    return { high, low };
  };
  return { changeFor, highLowFor, isLive };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useBasketPrices.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify the existing consumer still compiles/lints**

Run: `npm run lint`
Expected: no new errors. `TokenList.jsx` calls `useBasketPrices()` with no args → `enabled` defaults to `true` (unchanged behavior); it uses only `changeFor`, which is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBasketPrices.js src/hooks/__tests__/useBasketPrices.test.js
git commit -m "feat(watchlist): real 24h high/low + opt-in gate in useBasketPrices"
```

---

## Task 2: Rewire `WatchlistPage` to the real feeds

**Files:**
- Modify: `src/pages/WatchlistPage.jsx`

No automated test (repo has no page-component harness — follow existing pattern). Verified by hand in Step 3.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/pages/WatchlistPage.jsx` with:

```jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, TrendingUp, TrendingDown, Star, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TOP_SYMBOLS } from "@/lib/cryptos";
import { useLivePrices, isLivePricesEnabled } from "@/lib/priceFeed";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import CoinLogo from "@/components/CoinLogo";

const POPULAR = TOP_SYMBOLS;

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" });

  // Real, opt-in, holdings-blind price data. When live prices are OFF (default),
  // neither feed fetches (I2 — zero egress) and every figure below stays null:
  // we render an honest disabled state, never a fabricated or stale number.
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const { changeFor, highLowFor } = useBasketPrices({ enabled: liveOn });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => base44.entities.PersonalWatchlist.list(),
  });

  const add = useMutation({
    mutationFn: (d) => base44.entities.PersonalWatchlist.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setOpen(false); setForm({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" }); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...d }) => base44.entities.PersonalWatchlist.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setEditId(null); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.PersonalWatchlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function addQuick(symbol) {
    if (items.find(i => i.symbol === symbol)) return;
    add.mutate({ symbol, name: symbol });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Star className="h-5 w-5 text-yellow-400 fill-yellow-400" /> Watchlist</h1>
          <p className="text-sm text-muted-foreground">{items.length} assets tracked</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>
      </div>

      {/* Honest disabled state — no live feed unless the user opted in (I2). */}
      {!liveOn && items.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          Live prices are off. Turn them on in <span className="font-medium text-foreground">Settings</span> to see prices, 24h change and targets.
        </div>
      )}

      {/* Quick Add Popular */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Quick Add Popular</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map(s => {
            const has = items.find(i => i.symbol === s);
            return (
              <button key={s} onClick={() => addQuick(s)} disabled={!!has}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${has ? "border-primary/50 text-primary bg-primary/10 cursor-default" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                {has ? <Check className="inline h-3 w-3 mr-1" /> : null}{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Watchlist Table */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Star className="h-10 w-10 text-yellow-400/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Add assets to track their prices</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            // All figures are honest: null when off (no fetch) or unavailable
            // (fetch failed / symbol not in feed). Never a fabricated number.
            const price = liveOn ? (prices?.[item.symbol] ?? null) : null;
            const change = changeFor(item.symbol);
            const hl = highLowFor(item.symbol);
            const up = change != null && change >= 0;
            // Target badges evaluate ONLY against a real live price.
            const atBuy = price != null && item.target_buy && price <= item.target_buy;
            const atSell = price != null && item.target_sell && price >= item.target_sell;

            return (
              <div key={item.id} className={`bg-card border rounded-2xl p-4 transition-colors ${atBuy ? "border-green-500/50" : atSell ? "border-red-500/50" : "border-border"}`}>
                <div className="flex items-center gap-3">
                  <CoinLogo symbol={item.symbol} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{item.symbol}</p>
                      {atBuy && <Badge className="text-[9px] bg-green-500/20 text-green-500 border-green-500/30">Buy Target</Badge>}
                      {atSell && <Badge className="text-[9px] bg-red-500/20 text-red-500 border-red-500/30">Sell Target</Badge>}
                    </div>
                    {item.note && <p className="text-xs text-muted-foreground truncate">{item.note}</p>}
                    {hl && (
                      <p className="text-[10px] text-muted-foreground">
                        {hl.high != null && <>H: ${hl.high.toLocaleString()}</>}
                        {hl.high != null && hl.low != null && " · "}
                        {hl.low != null && <>L: ${hl.low.toLocaleString()}</>}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {price != null ? (
                      <p className="font-bold">${price.toLocaleString()}</p>
                    ) : (
                      <p className="font-bold text-muted-foreground">{liveOn ? "—" : "Off"}</p>
                    )}
                    {change != null && (
                      <p className={`text-xs flex items-center gap-0.5 justify-end ${up ? "text-green-500" : "text-red-500"}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? "+" : ""}{change.toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(item.id); setForm({ symbol: item.symbol, name: item.name || "", note: item.note || "", target_buy: item.target_buy || "", target_sell: item.target_sell || "" }); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove.mutate(item.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editId === item.id && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Buy below ($)</Label>
                      <Input value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="65000" type="number" className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Sell above ($)</Label>
                      <Input value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="75000" type="number" className="h-7 text-xs mt-0.5" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px]">Note</Label>
                      <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="h-7 text-xs mt-0.5" />
                    </div>
                    <Button size="sm" className="h-7 text-xs" onClick={() => update.mutate({ id: item.id, ...form, target_buy: form.target_buy ? parseFloat(form.target_buy) : undefined, target_sell: form.target_sell ? parseFloat(form.target_sell) : undefined })}>
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Watchlist</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Symbol</Label>
              <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="BTC, ETH, SOL..." className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Buy Below (USD)</Label>
                <Input value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="Optional" type="number" className="mt-1.5" />
              </div>
              <div>
                <Label>Sell Above (USD)</Label>
                <Input value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="Optional" type="number" className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="mt-1.5" />
            </div>
            <Button className="w-full" disabled={!form.symbol || add.isPending} onClick={() => add.mutate({ ...form, target_buy: form.target_buy ? parseFloat(form.target_buy) : undefined, target_sell: form.target_sell ? parseFloat(form.target_sell) : undefined })}>
              {add.isPending ? "Adding..." : "Add to Watchlist"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (note: `TOP_CRYPTOS` import is gone; only `TOP_SYMBOLS` remains).

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, open the app, unlock, go to `/watchlist`. Add BTC + ETH.
- With live prices OFF (default): the "Live prices are off" banner shows; each row shows "Off" for price, no change, no H/L; no Buy/Sell badge. Open browser DevTools → Network and confirm **no** request to `min-api.cryptocompare.com` originates from the Watchlist.
- Toggle live prices ON in Settings, return to `/watchlist`: real `$price`, a real `±x.xx%` change chip, and a real `H: … · L: …` line appear. Set a Buy-below target above the live price and confirm the green "Buy Target" badge + border light up only against the live price.

- [ ] **Step 4: Commit**

```bash
git add src/pages/WatchlistPage.jsx
git commit -m "feat(watchlist): wire WatchlistPage to real opt-in price feeds"
```

---

## Task 3: Rewire `WatchlistWidget` (price + change only)

**Files:**
- Modify: `src/components/WatchlistWidget.jsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/components/WatchlistWidget.jsx` with:

```jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Star, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLivePrices, isLivePricesEnabled } from "@/lib/priceFeed";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import CoinLogo from "@/components/CoinLogo";

export default function WatchlistWidget() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [symbol, setSymbol] = useState("");

  // Real, opt-in, holdings-blind. Off (default) ⇒ no fetch, no figures (I2).
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const { changeFor } = useBasketPrices({ enabled: liveOn });

  const { data: items = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => base44.entities.PersonalWatchlist.list(),
  });

  const add = useMutation({
    mutationFn: (data) => base44.entities.PersonalWatchlist.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setAdding(false); setSymbol(""); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.PersonalWatchlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Watchlist</p>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3">
          <Input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTC, ETH, SOL..."
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" className="h-8 text-xs" onClick={() => symbol && add.mutate({ symbol, name: symbol })}>
            Add
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No assets — add some to watch</p>
      ) : (
        <div className="space-y-2">
          {!liveOn && (
            <p className="text-[10px] text-muted-foreground">Live prices off — enable in Settings</p>
          )}
          {items.map(item => {
            const price = liveOn ? (prices?.[item.symbol] ?? null) : null;
            const change = changeFor(item.symbol);
            const up = change != null && change >= 0;
            return (
              <div key={item.id} className="flex items-center gap-2 group">
                <CoinLogo symbol={item.symbol} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.symbol}</p>
                  {item.note && <p className="text-[10px] text-muted-foreground truncate">{item.note}</p>}
                </div>
                <div className="text-right mr-1">
                  <p className="text-sm font-semibold">{price != null ? `$${price.toLocaleString()}` : "—"}</p>
                  {change != null && (
                    <p className={`text-[10px] flex items-center gap-0.5 justify-end ${up ? "text-green-500" : "text-red-500"}`}>
                      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {up ? "+" : ""}{change.toFixed(2)}%
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remove.mutate(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (`TOP_CRYPTOS` import removed).

- [ ] **Step 3: Manual verification**

In `npm run dev`, view the dashboard widget: OFF → "Live prices off — enable in Settings" + "—" prices, no change chip; ON → real price + real change chip.

- [ ] **Step 4: Commit**

```bash
git add src/components/WatchlistWidget.jsx
git commit -m "feat(watchlist): wire WatchlistWidget to real opt-in price feeds"
```

---

## Task 4: Full suite + status doc

**Files:**
- Modify: `docs/Feature-Status.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all green (existing suite + the 4 new `parseBasket` tests). `check:rng` (pretest) green.

- [ ] **Step 2: Update Feature-Status.md**

In `docs/Feature-Status.md` §10 ("Niceties / analytics / utilities"), update the Watchlist line. The current line bundles watchlist into the `💡` parking-lot entry ("Price charts / watchlist / portfolio / analytics / tax / signing / savings — 💡"). Add a dedicated, honest entry beneath it:

```markdown
- Watchlist (`/watchlist`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Wired off the
  fabricated `MOCK_PRICES` to the real opt-in feeds: `useLivePrices` (spot) +
  `useBasketPrices` (real 24h change + high/low). Holdings-blind, OFF by default
  (I2 — no egress until the Settings live-prices opt-in); off/unavailable shows
  an honest disabled state, never a fabricated or stale figure; Buy/Sell-target
  badges evaluate only against a live price. No on-chain artifact → not a
  catalogue "verified" promotion. See
  `docs/superpowers/specs/2026-06-17-watchlist-real-prices-design.md`.
```

Only make this edit after Steps 1–3 of Tasks 1–3 are confirmed by hand (status reflects verified reality, never intent — per the doc's own standing rule).

- [ ] **Step 3: Commit**

```bash
git add docs/Feature-Status.md
git commit -m "docs(status): Watchlist wired to real opt-in price feeds"
```

---

## Self-Review

**Spec coverage:**
- Real H/L via `useBasketPrices` → Task 1 (parseBasket high24h/low24h + highLowFor). ✓
- Off/unavailable honest-disabled, no fabricated/stale, targets only vs live price → Task 2 (liveOn banner, per-row null handling, atBuy/atSell gated on `price != null`). ✓
- Opt-in gating scoped to watchlist (default-true `enabled`, TokenList unchanged) → Task 1 (`enabled = true` default) + Tasks 2/3 pass `enabled: liveOn`. ✓
- Widget drops H/L (price + change only) → Task 3. ✓
- Persistence untouched → CRUD mutations copied verbatim in Tasks 2/3. ✓
- Tests for H/L extraction + fail-honest → Task 1 Step 1. ✓ (enabled no-egress verified manually per repo convention — Task 2 Step 3.)
- Status framing (not "verified"; update §10 on merge) → Task 4. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `useBasketPrices` returns `{ changeFor, highLowFor, isLive }`; `highLowFor` returns `{ high, low }` (consumed as `hl.high`/`hl.low` in Task 2); `parseBasket` per-symbol shape `{ change24h, high24h, low24h }` (read by `changeFor`/`highLowFor`); `useLivePrices` returns `{ prices }` (read as `prices?.[symbol]`). Consistent across tasks. `TOP_CRYPTOS` import removed from both rewired files; `TOP_SYMBOLS` retained in the page for `POPULAR`.
