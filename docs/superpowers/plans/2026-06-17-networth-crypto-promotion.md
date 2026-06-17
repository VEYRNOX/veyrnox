# Promote NetWorth → "Crypto Net Worth" (live, crypto-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the honest-disabled `/net-worth` page into a genuinely-real, crypto-only "Crypto Net Worth" view (real on-chain balances + live/approximate USD via the merged price helper), and promote its classification verdict from `disabled` to `live`.

**Architecture:** Rewrite `NetWorthTracker.jsx` to read ONLY `usePortfolio` (`grandTotal` + `assetTotals` + `priceBasis` + `indeterminate`) — dropping the fake `base44 Wallet × USD_RATES` math and the global-table manual real-world assets (a decoy-leak). A tiny pure `buildAllocation` helper feeds the allocation donut. Then flip the classification verdict, which un-gates the route automatically.

**Tech Stack:** JS (ESM), Vitest, React, recharts (existing), `usePortfolio`/`portfolioBalances` (on `main`), the feature-classification + USD-disclosure guards.

**Spec:** `docs/superpowers/specs/2026-06-17-networth-crypto-promotion-design.md`

**Base branch:** `claude/networth-promotion` off `main` (has the live-price helper #200).

---

## File Structure

- `src/lib/netWorthAllocation.js` — **create.** Pure `buildAllocation(assetTotals)` → sorted positive segments.
- `src/lib/__tests__/netWorthAllocation.test.js` — **create.** Unit tests.
- `src/pages/NetWorthTracker.jsx` — **rewrite.** Crypto-only, `usePortfolio`-backed.
- `src/lib/featureClassification.js` — **modify.** `/net-worth` verdict `disabled → live`.
- `src/lib/__tests__/featureClassification.test.js` — **modify.** Drop `/net-worth` from the non-live list.
- `src/lib/usdDisclosure.js` — **unchanged** (no entry — the page isn't auto-detected as USD-touching; adding one fails A4; UI discloses via `ReferenceRateNote`. See Task 3 Step 3).
- `docs/Feature-Status.md` — **modify.** Record the promotion.

---

## Task 1: `buildAllocation` pure helper

**Files:**
- Create: `src/lib/netWorthAllocation.js`
- Test: `src/lib/__tests__/netWorthAllocation.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/netWorthAllocation.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildAllocation } from '../netWorthAllocation.js';

describe('buildAllocation', () => {
  it('returns [] for empty/missing input', () => {
    expect(buildAllocation({})).toEqual([]);
    expect(buildAllocation(undefined)).toEqual([]);
  });

  it('keeps only positive-USD assets, sorted by USD descending', () => {
    const out = buildAllocation({
      ETH: { amount: 1, usd: 3200, indeterminate: false },
      BTC: { amount: 0.1, usd: 6800, indeterminate: false },
      SOL: { amount: 0, usd: 0, indeterminate: false },
    });
    expect(out).toEqual([
      { symbol: 'BTC', usd: 6800 },
      { symbol: 'ETH', usd: 3200 },
    ]);
  });

  it('excludes indeterminate (usd == null) assets', () => {
    const out = buildAllocation({
      ETH: { amount: 1, usd: 3200, indeterminate: false },
      BTC: { amount: null, usd: null, indeterminate: true },
    });
    expect(out).toEqual([{ symbol: 'ETH', usd: 3200 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/netWorthAllocation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/netWorthAllocation.js`**

```js
// lib/netWorthAllocation.js — pure chart-data helper for the Crypto Net Worth view.
//
// Turns the portfolio aggregator's `assetTotals` ({ [symbol]: { amount, usd,
// indeterminate } }) into allocation-donut segments: positive-USD assets only,
// largest first. Indeterminate (failed-read, usd == null) assets are excluded —
// they have no honest dollar weight to chart (I4: never treat a failed read as 0).

/**
 * @param {Record<string, { amount?: number, usd?: number|null, indeterminate?: boolean }>} assetTotals
 * @returns {Array<{ symbol: string, usd: number }>}
 */
export function buildAllocation(assetTotals) {
  return Object.entries(assetTotals || {})
    .map(([symbol, t]) => ({ symbol, usd: t && typeof t.usd === 'number' ? t.usd : 0 }))
    .filter((d) => d.usd > 0)
    .sort((a, b) => b.usd - a.usd);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/netWorthAllocation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/netWorthAllocation.js src/lib/__tests__/netWorthAllocation.test.js
git commit -m "feat(net-worth): buildAllocation pure helper for the crypto allocation donut"
```

---

## Task 2: Rewrite `NetWorthTracker.jsx` (crypto-only, usePortfolio-backed)

**Files:**
- Rewrite: `src/pages/NetWorthTracker.jsx`

No unit test (no React harness); verified by `npm run build` + the full suite staying green. The route is still gated to `HonestDisabledPage` until Task 3 promotes it, so this task is "build the real component"; Task 3 makes it render.

- [ ] **Step 1: Replace the entire file contents**

Replace ALL of `src/pages/NetWorthTracker.jsx` with:

```jsx
import { useWallet } from "@/lib/WalletProvider";
import { usePortfolio } from "@/lib/portfolioBalances";
import { buildAllocation } from "@/lib/netWorthAllocation";
import { CURRENCY_COLORS, approxUsd } from "@/lib/cryptos";
import { formatFiat } from "@/components/FiatCurrencySelector";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import CoinLogo from "@/components/CoinLogo";
import { RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Crypto Net Worth (promoted from the honest-disabled NetWorth shell). Shows the
// owner's REAL on-chain holdings via usePortfolio — total + allocation donut +
// per-asset rows — with USD that is LIVE (opt-in price feed) or clearly-labeled
// APPROXIMATE (reference rates) when live is off/unavailable. CRYPTO ONLY: the
// old manual real-world assets were dropped — they lived in a global, non-vault-
// scoped table that a decoy session would expose (I3). usePortfolio is session-
// scoped (a decoy sees only the decoy's holdings; no isDecoy branch here).
// ─────────────────────────────────────────────────────────────────────────────

const fmtPriceTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

export default function NetWorthTracker() {
  const { isUnlocked, wallets, walletAddresses } = useWallet();
  const { data: portfolio, isLoading, priceBasis, pricesUpdatedAt, refetchPrices } = usePortfolio(wallets, walletAddresses);

  const total = portfolio?.grandTotal ?? 0;
  const incomplete = !!portfolio?.indeterminate;
  const assetTotals = portfolio?.assetTotals || {};
  const live = priceBasis === "live";
  // null amount/usd = indeterminate (read failed) → "—", never a misleading $0.
  const fmtUsd = (n) => (n == null ? "—" : live ? formatFiat(n, "USD") : approxUsd(n));
  const allocation = buildAllocation(assetTotals);

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-xl font-bold">Crypto Net Worth</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see your on-chain holdings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Crypto Net Worth</h1>
        <p className="text-sm text-muted-foreground">Your on-chain holdings — does not include external assets.</p>
      </div>

      {/* Total */}
      <div className="p-5 rounded-2xl border border-border bg-card text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Total holdings</p>
        <p className="text-4xl font-bold mt-1">{isLoading ? "…" : fmtUsd(total)}</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          {incomplete && <span className="text-amber-600 dark:text-amber-400">partial — some balances couldn’t be read</span>}
          {live ? (
            <button
              type="button"
              onClick={() => refetchPrices?.()}
              className="inline-flex items-center gap-1 hover:text-foreground"
              title="Refresh live prices"
            >
              <RefreshCw className="h-3 w-3" /> Live{pricesUpdatedAt ? " · " + fmtPriceTime(pricesUpdatedAt) : ""}
            </button>
          ) : (
            <span>Approximate</span>
          )}
        </div>
      </div>

      {/* Allocation donut */}
      {allocation.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-3">Allocation</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={allocation} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="usd" nameKey="symbol">
                  {allocation.map((d) => <Cell key={d.symbol} fill={CURRENCY_COLORS[d.symbol] || "#6b7280"} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {allocation.map((d) => (
                <div key={d.symbol} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CURRENCY_COLORS[d.symbol] || "#6b7280" }} />
                    {d.symbol}
                  </span>
                  <span className="font-medium">{fmtUsd(d.usd)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-asset holdings */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3">Holdings</p>
        {Object.keys(assetTotals).length === 0 ? (
          <p className="text-sm text-muted-foreground">No holdings yet.</p>
        ) : (
          Object.entries(assetTotals).map(([symbol, t]) => (
            <div key={symbol} className="flex justify-between items-center text-sm py-1 border-b border-border/50 last:border-0">
              <span className="flex items-center gap-2 text-muted-foreground"><CoinLogo symbol={symbol} size={20} />{symbol}</span>
              <span className="font-medium">{t.indeterminate ? "—" : fmtUsd(t.usd)}</span>
            </div>
          ))
        )}
      </div>

      {/* Reference-rate disclosure — shown only when figures are the approximate
          stale rates (when live, values are real-time and need no caveat). The
          token's presence here also satisfies the usdDisclosure guard (A2). */}
      {!live && <ReferenceRateNote />}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component builds and nothing imports the removed exports**

Run: `npm run build`
Expected: exit 0. (Confirms the recharts/`formatFiat`/`approxUsd`/`CoinLogo`/`CURRENCY_COLORS`/`ReferenceRateNote` imports all resolve and no stale `base44`/`NetWorthAsset`/`USD_RATES` reference remains.)

Also grep to confirm the fakes are gone:
Run: `git grep -n "NetWorthAsset\|USD_RATES\|base44" src/pages/NetWorthTracker.jsx || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/NetWorthTracker.jsx
git commit -m "feat(net-worth): rewrite as crypto-only Crypto Net Worth (usePortfolio, live/approx USD)"
```

---

## Task 3: Promote `/net-worth` classification (disabled → live)

**Files:**
- Modify: `src/lib/featureClassification.js`
- Modify: `src/lib/__tests__/featureClassification.test.js`

These are interdependent — the classification suite enforces that the verdict and the runtime registry stay consistent — so change them together. **Do NOT add a `usdDisclosure.js` entry** (see Step 3).

- [ ] **Step 1: Flip the verdict in `featureClassification.js`**

Replace the `/net-worth` entry (currently `{ verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities', note: '...' }`) with:

```js
  '/net-worth': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Crypto Net Worth (crypto-only): real on-chain balances via usePortfolio (grandTotal + assetTotals), USD shown live (opt-in price feed) or clearly-labeled approximate (reference rates) when off/unavailable. The fake base44-Wallet × stale-USD_RATES math and the global-table manual real-world assets (a decoy-session leak) were removed.',
  },
```

(Drop `reason` entirely — a `live` entry carries no reason; keeping `reason:'unverified'` would fail the "no unverified page is live" test. `dataSource` is informational and may stay, like the live `/invoices` entry.)

- [ ] **Step 2: Drop `/net-worth` from the non-live list in `featureClassification.test.js`**

In `src/lib/__tests__/featureClassification.test.js`, the `registryEntriesFromClassification` test asserts the exact set of non-live routes. Find the line:
```js
        '/budget', '/net-worth', '/tax',
```
and remove `'/net-worth', ` so it reads:
```js
        '/budget', '/tax',
```
(This mirrors the existing precedent in that file where `/fee-analytics` was removed on its `disabled → live` promotion — see the comment near `/calculator`.)

- [ ] **Step 3: Do NOT add a `usdDisclosure.js` entry — and understand why**

Leave `src/lib/usdDisclosure.js` unchanged. Reasoning (this is the subtle part):
- `usdDisclosure.test.js` classifies a route as "USD-touching" ONLY when its page imports `USD_RATES`
  directly OR imports a `USD_DISPLAY_COMPONENTS` member (`TokenList`/`AssetDistributionChart`/
  `PortfolioChart`/`ExportTransactions`). The rewritten `NetWorthTracker` imports **neither** — its USD
  comes through the `usePortfolio` lib helper.
- Therefore `/net-worth` is **not** in the suite's `liveUsdRoutes` set. Consequence:
  - **A1** (every live USD-touching route is declared) does NOT require a `/net-worth` entry.
  - **A4** (every declared route IS a live USD-touching route) would **FAIL** if you added one — a declared
    `/net-worth` would be flagged as a "stale entry" because the scanner can't see it touching USD.
- The honest disclosure is still present **in the UI**: the page renders `<ReferenceRateNote />` whenever it
  shows approximate (reference-rate) figures. The registry is a completeness guard for directly-detectable
  pages; the maintainer note in `usdDisclosure.js` documents this lib-helper blind spot. So: no entry, UI
  discloses honestly, both A1 and A4 pass.

- [ ] **Step 4: Run the guard suites**

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js src/lib/__tests__/usdDisclosure.test.js`
Expected: PASS — classification green (verdict `live`, removed from the non-live set, registry consistent);
USD disclosure green **with no `/net-worth` entry** (A1 doesn't require it, A4 has nothing stale). If either
suite fails, report the exact failing assertion rather than guessing — do NOT add a disclosure entry to
"fix" an A4 failure (that's backwards).

- [ ] **Step 5: Commit**

```bash
git add src/lib/featureClassification.js src/lib/__tests__/featureClassification.test.js
git commit -m "feat(net-worth): promote /net-worth disabled -> live (crypto-only, real data)"
```

---

## Task 4: Update Feature-Status doc

**Files:**
- Modify: `docs/Feature-Status.md`

- [ ] **Step 1: Update the §10 net-worth mention**

In `docs/Feature-Status.md` §10, the line listing "Price charts / watchlist / portfolio / net-worth / … — 💡" should have net-worth removed from the parking-lot list, and a dedicated line added:

Change:
```
- Price charts / watchlist / portfolio / net-worth / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)
```
to:
```
- Price charts / watchlist / portfolio / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)
- Crypto Net Worth (`/net-worth`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted honest-disabled → live:
  real on-chain holdings via `usePortfolio` (total + allocation donut + per-asset rows), USD live (opt-in
  feed) or disclosed-approximate. CRYPTO-ONLY — manual real-world assets dropped (global-table decoy leak);
  a per-vault manual-assets store is a deferred follow-on. See
  `docs/superpowers/specs/2026-06-17-networth-crypto-promotion-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/Feature-Status.md
git commit -m "docs(net-worth): record Crypto Net Worth promotion (disabled -> live)"
```

---

## Final verification

- [ ] **Full suite + build**

Run: `npx vitest run`
Expected: PASS — new `netWorthAllocation.test.js`; updated `featureClassification.test.js` + `usdDisclosure.test.js`; nothing regressed.
Run: `npm run build`
Expected: exit 0.

(Worktree vitest note: if `fake-indexeddb` fails to resolve under `/@fs`, that's the known worktree-config quirk — CI runs a full checkout. The three relevant test files here don't need IndexedDB and can be run individually.)

- [ ] **Optional dev smoke**

Navigate to `/net-worth`: it now renders the real "Crypto Net Worth" page (not the disabled notice). With live prices OFF (default) the total shows "≈$…" + "Approximate" + ReferenceRateNote; toggle live ON in Settings → "Live · HH:MM" + exact figures. A decoy/duress unlock shows only the decoy's holdings (no real-world assets anywhere). Sanity check, not a gate.

---

## Notes / invariants honored

- **I3 / deniability:** crypto-only via session-scoped `usePortfolio` (decoy sees only its own holdings); the manual-asset cross-session leak is eliminated by removal; no `isDecoy`/`isHidden` branch added.
- **I2:** live prices inherited from the opt-in helper (off by default → no egress); balances are the user's own RPC reads.
- **I4 / no fake security:** failed reads render "—"/partial (never silent 0); live-unavailable → labeled approximate; honest crypto-only title.
- **Honest promotion:** verdict flip is justified (the page is now genuinely real), follows the `/fee-analytics` precedent, and is enforced consistent by the classification + disclosure guards. Status caps at BUILT/UNAUDITED-PROVISIONAL (no on-chain artifact).
