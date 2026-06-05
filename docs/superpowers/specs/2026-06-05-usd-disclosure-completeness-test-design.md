# Reference-rate disclosure completeness test

**Date:** 2026-06-05
**Branch:** `test/usd-disclosure-completeness` (off `main`)
**Status:** Approved design — ready for implementation plan

## Problem

PRs #111 and #114 made every `USD_RATES`-derived figure on the **live** USD
surfaces render with an honest disclosure (`ReferenceRateNote` for the wording,
`approxUsd` for the number). Nothing stops that from silently regressing: a new
page, or a page promoted `disabled` → `live`, can render a stale-rate dollar
figure with no disclosure and no failing test. This adds a test that **fails CI
when a `live` route renders a `USD_RATES`-derived dollar figure without the
disclosure.**

It mirrors the codebase's existing audit philosophy: a deliberate,
hand-maintained source-of-truth declaration plus a test that fails on drift —
exactly how `CLASSIFICATION` (`featureClassification.test.js`) and the
router-vs-audit check (`routeAudit.test.js`, which already reads `App.jsx` as
source) work.

## Non-goals

- **No production code changes.** Pure test + a declaration module.
- **Not** a guard over `disabled`/`cut` routes — those aren't presented to users
  as live, so a stale figure there is out of scope (consistent with #111/#114).
- **Not** a perfect static analyzer. It is a deliberate-declaration + drift-guard,
  not AST-level dataflow. The declaration carries human judgement; the test
  enforces that nothing escapes it.

## Mechanism

### Source of truth — `src/lib/usdDisclosure.js`

```js
// Live routes that render (or could render) a USD_RATES-derived figure. Each is
// deliberately categorized. Keyed by route path (must be a 'live' route).
export const USD_DISCLOSURE = {
  '/':           { discloses: true },   // Dashboard -> WalletPortfolioPage total + DemoDashboard
  '/send':       { discloses: true },   // fee fiat estimate + spend-cap previews
  '/security':   { discloses: true },   // "sent today" daily-limit progress
  '/risk-score': { exempt: 'internal-math',
                   note: 'USD_RATES feeds risk ratios only; the page renders a 0–10 score, no $ figure.' },
};

// Components (not routes) that render USD_RATES-derived $; a page that imports
// one "touches USD display" even if it does not import USD_RATES itself.
export const USD_DISPLAY_COMPONENTS = [
  'TokenList', 'AssetDistributionChart', 'PortfolioChart', 'ExportTransactions',
];
```

`discloses: true` → the page source must reference `approxUsd` or
`ReferenceRateNote`. `exempt` → the page imports `USD_RATES` but renders no
dollar figure (must carry a non-empty `note`).

### The test — `src/lib/__tests__/usdDisclosure.test.js`

Reads source files (like `routeAudit.test.js`); performs no rendering.

1. **Parse `App.jsx`** for `<Route path="X" element={<Comp/>}>` and the matching
   `const Comp = lazy(() => import('./pages/File'))` to map **route → page file**.
   (Same string-scan approach as `routeAudit.test.js`.)
2. **Restrict to `live` routes** via `CLASSIFICATION` from `featureClassification.js`.
3. A live route **"touches USD display"** if its page file imports `USD_RATES`
   (`from "@/lib/cryptos"`) **or** imports any name in `USD_DISPLAY_COMPONENTS`.

**Assertions:**

- **A1 — Drift guard.** Every live route that touches USD display has an entry in
  `USD_DISCLOSURE`. (A new such page fails until a human categorizes it.)
- **A2 — Disclosure present.** Every `discloses: true` route's page file references
  `approxUsd` or `ReferenceRateNote`.
- **A3 — Exempt integrity.** Every `exempt` entry has a non-empty `note`, AND the
  page file references **none** of `approxUsd`, `ReferenceRateNote`, or
  `formatFiat(` — i.e. it uses no USD-display/disclosure helper, confirming it
  renders no dollar figure. (See "A3 heuristic" below.)
- **A4 — No stale entries.** Every key in `USD_DISCLOSURE` is a live route that
  touches USD display (no entry for a route that was removed, demoted from live,
  or no longer touches USD).
- **A5 — Entry shape.** Each entry is exactly one of `{ discloses: true }` or
  `{ exempt: <string>, note: <non-empty string> }` (not both, not neither).
- **A6 — Sentinel.** Parsing `App.jsx` must yield a non-empty live-route set and a
  non-empty live USD-touching set; if either is empty the test fails loudly
  rather than passing vacuously (the defense `routeAudit.test.js` uses).

### A3 heuristic (deliberate choice)

A3 detects "the page renders a dollar figure" via the **USD-display helpers**
(`approxUsd`, `ReferenceRateNote`, `formatFiat(`) rather than a literal `$`
regex. A `$` regex is unreliable here because JSX/JS template literals use
`${…}` interpolation everywhere (e.g. `className={\`text-6xl ${c}\`}`), which
would false-positive on internal-math pages like `PortfolioRiskScore`. Matching
the named helpers is robust and false-positive-free for the current codebase,
where every displayed USD figure flows through one of them.

**Accepted limitation:** a page that renders a raw `$${value}` dollar figure
*without* any helper and is mislabeled `exempt` would slip A3. This is the
narrow case the "strict, add escape hatch only if needed" decision defers — if it
ever occurs, tighten A3 then. No escape hatch is added pre-emptively.

## Seed reflects current reality (test goes green on first run)

The 4 entries above are the complete current live USD-touching set:
- `/`, `/send`, `/security` already reference `approxUsd`/`ReferenceRateNote`
  (A2 passes).
- `/risk-score` references none of the helpers (A3 passes).
- The 4 `USD_DISPLAY_COMPONENTS` are currently imported only by `Dashboard`,
  which already imports `USD_RATES` directly — so the component list is
  forward-looking (guards a future live page that renders USD purely via a
  child component).

## Affected files

- `src/lib/usdDisclosure.js` — new declaration module.
- `src/lib/__tests__/usdDisclosure.test.js` — new test.
- No other files. No production behavior change.

## Testing

The test *is* the deliverable. It must pass green against current `main`
(seed = current reality). To prove the guard actually bites, the implementation
plan includes a throwaway local check: temporarily flip `/risk-score` to
`{ discloses: true }` and confirm A2 fails; revert.
