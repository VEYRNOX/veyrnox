# Reference-Rate Disclosure Completeness Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a test that fails CI when a `live` route renders a `USD_RATES`-derived dollar figure without the disclosure (`approxUsd`/`ReferenceRateNote`).

**Architecture:** A hand-maintained declaration (`src/lib/usdDisclosure.js`) categorizes every live USD-touching route as `discloses` or `exempt`. A source-scanning test (`src/lib/__tests__/usdDisclosure.test.js`) parses `App.jsx` (route → page file), restricts to `live` routes from `CLASSIFICATION`, and runs six assertions (drift guard, disclosure present, exempt integrity, no stale entries, entry shape, sentinel). No production code changes. Mirrors the existing `routeAudit.test.js` source-scan pattern.

**Tech Stack:** Vitest (jsdom), `node:fs`/`node:path`, `@/` alias. The route→file parser and detection logic were validated against the real `App.jsx` before this plan was written (live set = 41, no parse gap, live USD-touching set = `/`, `/send`, `/security`, `/risk-score`).

Spec: `docs/superpowers/specs/2026-06-05-usd-disclosure-completeness-test-design.md`

---

### Task 1: Failing test — drives the declaration module into existence

The test imports from `../usdDisclosure`, which does not exist yet, so it fails at
import resolution. This is the TDD "red" step.

**Files:**
- Create: `src/lib/__tests__/usdDisclosure.test.js`

- [ ] **Step 1: Write the test file**

Create `src/lib/__tests__/usdDisclosure.test.js` with EXACTLY this content:

```js
// src/lib/__tests__/usdDisclosure.test.js
//
// Completeness guard for the reference-rate disclosure (see PRs #111/#114).
// Fails when a `live` route renders a USD_RATES-derived dollar figure without
// the disclosure (approxUsd / ReferenceRateNote). Source-scanning only — no
// rendering — mirroring routeAudit.test.js. The declaration in
// src/lib/usdDisclosure.js is the deliberate source of truth; these assertions
// enforce that nothing escapes it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CLASSIFICATION } from '../featureClassification';
import { USD_DISCLOSURE, USD_DISPLAY_COMPONENTS } from '../usdDisclosure';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const appSrc = read('../../App.jsx');

// --- Parse App.jsx: route path -> page component -> page file ----------------
// component -> page file basename, from `const X = lazy(() => import('./pages/File'))`
const lazyMap = {};
for (const m of appSrc.matchAll(
  /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/pages\/([^'"]+)['"]\)\)/g,
)) {
  lazyMap[m[1]] = m[2];
}
// Layout-gated routes: path -> component, within the <Layout> block.
const LAYOUT_MARKER = 'element={<Layout />}>';
const lstart = appSrc.indexOf(LAYOUT_MARKER);
const lend = appSrc.indexOf('</Route>', lstart);
const layoutBlock = lstart === -1 ? '' : appSrc.slice(lstart + LAYOUT_MARKER.length, lend);
const routeToComponent = {};
for (const m of layoutBlock.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)\s*\/>\}/g)) {
  routeToComponent[m[1]] = m[2];
}

function pageTextForRoute(path) {
  const comp = routeToComponent[path];
  const file = comp && lazyMap[comp];
  return file ? read(`../../pages/${file}.jsx`) : null;
}

// --- Detection on a page's source text --------------------------------------
const DISPLAY_RE = new RegExp(`\\b(${USD_DISPLAY_COMPONENTS.join('|')})\\b`);
const importsUsdRates = (t) =>
  /import\s*\{[^}]*\bUSD_RATES\b[^}]*\}\s*from\s*['"]@\/lib\/cryptos['"]/.test(t);
const importsDisplayComponent = (t) =>
  t.split('\n').some((l) => /^\s*import\b/.test(l) && DISPLAY_RE.test(l));
const touchesUsd = (t) => importsUsdRates(t) || importsDisplayComponent(t);
const hasDisclosureHelper = (t) => /\b(approxUsd|ReferenceRateNote)\b/.test(t);
const hasUsdDisplayHelper = (t) =>
  /\b(approxUsd|ReferenceRateNote)\b/.test(t) || /\bformatFiat\(/.test(t);

// --- Compute the live USD-touching set --------------------------------------
const liveRoutesAll = Object.keys(CLASSIFICATION).filter((p) => CLASSIFICATION[p].verdict === 'live');
const liveUsdRoutes = liveRoutesAll
  .filter((p) => routeToComponent[p])
  .filter((p) => {
    const t = pageTextForRoute(p);
    return t != null && touchesUsd(t);
  });

describe('reference-rate disclosure completeness', () => {
  it('A6 sentinel: App.jsx parsed; every live route resolves to a page file', () => {
    expect(lstart, 'Layout block not found in App.jsx').not.toBe(-1);
    expect(liveRoutesAll.length, 'no live routes in CLASSIFICATION').toBeGreaterThan(10);
    const unparsed = liveRoutesAll.filter((p) => !routeToComponent[p]);
    expect(unparsed, `live routes not parsed from App.jsx: ${unparsed.join(', ')}`).toEqual([]);
    expect(liveUsdRoutes.length, 'no live USD-touching routes found').toBeGreaterThan(0);
  });

  it('A1 drift guard: every live USD-touching route is declared in USD_DISCLOSURE', () => {
    const undeclared = liveUsdRoutes.filter((p) => !USD_DISCLOSURE[p]);
    expect(
      undeclared,
      `live routes render USD_RATES-derived figures but are uncategorized in USD_DISCLOSURE (add {discloses:true} or {exempt,note}): ${undeclared.join(', ')}`,
    ).toEqual([]);
  });

  it('A2 disclosure present: discloses:true routes reference approxUsd/ReferenceRateNote', () => {
    const missing = Object.keys(USD_DISCLOSURE)
      .filter((p) => USD_DISCLOSURE[p].discloses)
      .filter((p) => {
        const t = pageTextForRoute(p);
        return !t || !hasDisclosureHelper(t);
      });
    expect(missing, `discloses:true routes missing the disclosure helper: ${missing.join(', ')}`).toEqual([]);
  });

  it('A3 exempt integrity: exempt routes have a note and render no USD-display helper', () => {
    for (const [p, e] of Object.entries(USD_DISCLOSURE)) {
      if (!e.exempt) continue;
      expect(typeof e.note === 'string' && e.note.length > 0, `${p}: exempt entry needs a non-empty note`).toBe(true);
      const t = pageTextForRoute(p);
      expect(t, `${p}: page file not found`).not.toBeNull();
      expect(
        hasUsdDisplayHelper(t),
        `${p}: marked exempt but references a USD-display helper (approxUsd/ReferenceRateNote/formatFiat) — it appears to display a $ figure`,
      ).toBe(false);
    }
  });

  it('A4 no stale entries: every declared route is live and USD-touching', () => {
    const stale = Object.keys(USD_DISCLOSURE).filter((p) => !liveUsdRoutes.includes(p));
    expect(stale, `USD_DISCLOSURE entries that are not live USD-touching routes (remove or fix): ${stale.join(', ')}`).toEqual([]);
  });

  it('A5 entry shape: exactly {discloses:true} XOR {exempt:<string>, note}', () => {
    for (const [p, e] of Object.entries(USD_DISCLOSURE)) {
      const isDisclose = e.discloses === true && e.exempt === undefined;
      const isExempt = typeof e.exempt === 'string' && e.discloses === undefined;
      expect(isDisclose !== isExempt, `${p}: entry must be exactly one of {discloses:true} or {exempt:<string>, note}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `npx vitest run src/lib/__tests__/usdDisclosure.test.js`
Expected: FAIL — `Failed to resolve import "../usdDisclosure"` (the module does not exist yet).

- [ ] **Step 3: Commit the failing test**

```bash
git add src/lib/__tests__/usdDisclosure.test.js
git commit -m "test(usd): add reference-rate disclosure completeness test (red)"
```

---

### Task 2: Create the declaration module — turns the test green

**Files:**
- Create: `src/lib/usdDisclosure.js`

- [ ] **Step 1: Write the declaration module**

Create `src/lib/usdDisclosure.js` with EXACTLY this content:

```js
// src/lib/usdDisclosure.js
//
// Source of truth for which LIVE routes render USD_RATES-derived dollar figures
// and therefore must carry the reference-rate disclosure (approxUsd /
// ReferenceRateNote). Enforced by usdDisclosure.test.js: a new live page that
// renders a stale-rate $ figure fails the suite until it is categorized here.
//
// Each entry is exactly one of:
//   { discloses: true }              page must reference approxUsd or ReferenceRateNote
//   { exempt: <why>, note: <string> } imports USD_RATES but renders NO $ figure
export const USD_DISCLOSURE = {
  '/':           { discloses: true },   // Dashboard -> WalletPortfolioPage total + DemoDashboard
  '/send':       { discloses: true },   // fee fiat estimate + spend-cap previews
  '/security':   { discloses: true },   // "sent today" daily-limit progress
  '/risk-score': {
    exempt: 'internal-math',
    note: 'USD_RATES feeds risk ratios only; the page renders a 0–10 score, no $ figure.',
  },
};

// Components (not routes) that render a USD_RATES-derived $ figure. A page that
// imports one "touches USD display" even if it does not import USD_RATES itself,
// so it must be categorized in USD_DISCLOSURE.
export const USD_DISPLAY_COMPONENTS = [
  'TokenList', 'AssetDistributionChart', 'PortfolioChart', 'ExportTransactions',
];
```

- [ ] **Step 2: Run the test and confirm it PASSES**

Run: `npx vitest run src/lib/__tests__/usdDisclosure.test.js`
Expected: PASS — 6 tests (A1–A6) green. The seed matches current reality:
`/`, `/send`, `/security` reference the disclosure helper; `/risk-score` references none.

- [ ] **Step 3: Commit**

```bash
git add src/lib/usdDisclosure.js
git commit -m "feat(usd): declare USD_DISCLOSURE source of truth (test green)"
```

---

### Task 3: Prove the guard bites, then full verification

The test is green by design; this task proves it is **not vacuous** and runs the
full gate. The mutations here are TEMPORARY and reverted — do NOT commit them.

**Files:** none committed (temporary edits reverted).

- [ ] **Step 1: Prove A1 (drift guard) bites**

Temporarily delete the `'/send'` line from `src/lib/usdDisclosure.js`.
Run: `npx vitest run src/lib/__tests__/usdDisclosure.test.js`
Expected: **FAIL** at A1 with `...uncategorized in USD_DISCLOSURE ... /send`.
Then restore the `'/send'` line exactly.

- [ ] **Step 2: Prove A2 (disclosure present) bites**

Temporarily change `'/risk-score'` to `{ discloses: true }` in `src/lib/usdDisclosure.js`.
Run: `npx vitest run src/lib/__tests__/usdDisclosure.test.js`
Expected: **FAIL** at A2 with `discloses:true routes missing the disclosure helper: /risk-score`.
Then restore the original `'/risk-score'` exempt entry exactly.

- [ ] **Step 3: Confirm clean tree after reverts**

Run: `git status --short`
Expected: empty (both mutations reverted; nothing staged or modified).

- [ ] **Step 4: Lint the changed files**

Run: `npx eslint src/lib/usdDisclosure.js src/lib/__tests__/usdDisclosure.test.js --quiet`
Expected: exit 0, no output.

- [ ] **Step 5: Full test suite**

Run: `npm test`
Expected: PASS — previous green count **plus the 6 new tests**, 0 failures. (No
production files changed, so nothing else moves.)

---

## Notes for the implementer

- The parser/detection code in Task 1 was validated against the real `App.jsx`
  before this plan was written: 41 live routes, zero parse gap, live USD-touching
  set = `/`, `/send`, `/security`, `/risk-score`. If A6 ever reports a parse gap,
  `App.jsx` route syntax changed — fix the regex, don't weaken the assertion.
- Do not add an A3 escape hatch (e.g. `allowDollarText`) unless a real page hits
  a false positive — per the approved design decision. The current strict A3
  passes for `/risk-score`.
- No production source changes. If you find yourself editing a page component,
  stop — that's out of scope for this plan.
