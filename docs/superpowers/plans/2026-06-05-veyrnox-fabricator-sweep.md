# Veyrnox Fabricator Classification Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every app route against the wedge-alignment filter, record a deliberate verdict for each in a single audit source of truth, derive the runtime feature registry from it, and honest-disable the pages that present fabricated/mislabeled data as real.

**Architecture:** Introduce `src/lib/featureClassification.js` — a complete audit (`CLASSIFICATION`: every route path → `{ verdict, dataSource, note }`) plus the canonical `ALL_ROUTE_PATHS` list. Refactor the existing `featureRegistry.js` so its runtime exceptions (`disabled`/`cut`) are **derived** from `CLASSIFICATION` (single source of truth). A coverage test fails until every route has a verdict; a consistency test binds the audit to the registry's runtime behaviour. The classification itself is done page-by-page, by nav group, against a fixed rubric.

**Tech Stack:** React 18 + react-router-dom v6, Vitest pure-function tests, `@/` alias → `src/`.

**Source spec:** `docs/superpowers/specs/2026-06-04-veyrnox-positioning-scope-design.md` (§2 filter, §3 triage, §6 clean data path).

---

## PREREQUISITE (blocks execution)

This plan **assumes `feat/feature-registry` is merged to `main`** — it builds on `src/lib/featureRegistry.js` and its tests. Do not start until that PR is merged and this worktree is rebased onto the updated `main`. Verify before Task 1:

```bash
test -f src/lib/featureRegistry.js && echo "registry present" || echo "STOP: rebase onto merged main first"
```

If it prints `STOP`, rebase this branch onto the merged `main` and re-check.

**Execution note:** run on this worktree's branch. Each classification task ends in a commit; the suite must stay green throughout.

---

## The Rubric (apply to EVERY page)

For each route, open its page component and trace where its displayed data comes from, then assign exactly one verdict.

### Data-source decision (the heart of gate 2 + gate 3)
- **On-device / wallet-core** (`@/wallet-core/*`, the encrypted vault, local computation over data the app already holds) → clean source.
- **`base44.entities.*`** → indirection. In demo mode this is *seeded demo data*; in the local build it is the user's *local* records. A page is only honest if it does **not** present this as something it is not (e.g. labeling internal transaction aggregation as "On-Chain Analytics", or demo seeds as the user's real holdings).
- **External API / indexer / LLM / price feed** (`fetch` to a third party, `base44.integrations.*`, anything that needs a server) → leaks address or needs a backend → fails gate 2/4.
- **Invented in-component** (`Math.random`, hardcoded arrays of "results", canned scores presented as the user's real numbers) → fabrication → fails gate 3 (the cardinal sin).

### Verdict
- **`live`** — passes all four gates: serves the coercion-resistant-vault job (or is core wallet plumbing) AND its data is on-device/wallet-core (or honestly-labeled local) AND it shows only real/verified data AND it works without a server. Leave it running.
- **`disabled`** — belongs to the product but currently fails gate 2/3/4 (needs an indexer, needs a server, presents demo/internal data as real, or is unverified). Honest-disable it. Pick the `reason`:
  - `leaks` — only works by querying a third-party indexer with the user's address.
  - `server` — needs a backend this build doesn't ship (LLM, email, push relay).
  - `unverified` — fabricates or presents simulated/demo data as real; or shows numbers not yet verified against a real source.
- **`cut`** — does not serve the vault job at all (off-wedge); a targeting vector or pure base44 filler. Reason `off-wedge`.

### Worked examples (real, from this codebase)
- `/trust-score` → **`live`**. `pages/TrustScore.jsx` runs the real `classifyToken` from `@/wallet-core/evm/spam` over public token metadata, with an explicit honesty contract and no chain reads or third-party calls. Clean. dataSource: `wallet-core`.
- `/onchain` → **`disabled`**, reason `unverified`. `pages/OnChainAnalytics.jsx` aggregates `base44.entities.Transaction` but presents it under the title "On-Chain Analytics / Transaction activity and wallet insights" — mislabeled internal/demo data as on-chain insight. dataSource: `base44-entities`.
- `/leaderboard` → **`cut`**, reason `off-wedge`. Already cut by the registry; recorded here for completeness.

When uncertain between `live` and `disabled`, default to `disabled` — for a wallet, showing nothing honest beats showing something misleading.

---

## File Structure

**Create:**
- `src/lib/featureClassification.js` — `ALL_ROUTE_PATHS` (canonical route list) + `CLASSIFICATION` (every path → verdict/dataSource/note) + derivation helper `registryEntriesFromClassification()`.
- `src/lib/__tests__/featureClassification.test.js` — coverage test (every route classified) + verdict-shape test.

**Modify:**
- `src/lib/featureRegistry.js` — derive `FEATURE_REGISTRY` from `CLASSIFICATION` instead of the hand-written literal (keeps a single source of truth; preserves existing runtime behaviour).
- `src/lib/__tests__/featureRegistry.test.js` — unchanged assertions must still pass (regression guard); add a consistency test binding registry status to the audit.

**Out of scope (later plans):** wiring `disabled` shells to real data (Pile 1), the signed local export, hard-deleting `cut` page files, tier copy.

---

## Task 1: Classification scaffold + coverage ratchet

**Files:**
- Create: `src/lib/featureClassification.js`
- Test: `src/lib/__tests__/featureClassification.test.js`

- [ ] **Step 1: Write the failing coverage test**

```js
// src/lib/__tests__/featureClassification.test.js
import { describe, it, expect } from 'vitest';
import { ALL_ROUTE_PATHS, CLASSIFICATION } from '../featureClassification';

const VERDICTS = ['live', 'disabled', 'cut'];

describe('classification completeness', () => {
  it('assigns a deliberate verdict to EVERY route (no route left unclassified)', () => {
    const missing = ALL_ROUTE_PATHS.filter((p) => !CLASSIFICATION[p]);
    expect(missing).toEqual([]);
  });

  it('classifies no path that is not a real route', () => {
    const extra = Object.keys(CLASSIFICATION).filter((p) => !ALL_ROUTE_PATHS.includes(p));
    expect(extra).toEqual([]);
  });

  it('every entry has a valid verdict and a non-empty note', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      expect(VERDICTS, `${path} verdict`).toContain(entry.verdict);
      expect(typeof entry.note, `${path} note`).toBe('string');
      expect(entry.note.length, `${path} note`).toBeGreaterThan(0);
    }
  });

  it('every disabled entry carries a reason (leaks|server|unverified)', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'disabled') {
        expect(['leaks', 'server', 'unverified'], `${path} reason`).toContain(entry.reason);
      }
    }
  });
});
```

- [ ] **Step 2: Run it, verify it FAILS**

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js`
Expected: FAIL — `Cannot find module '../featureClassification'`.

- [ ] **Step 3: Create the scaffold with the canonical route list and the 4 already-decided entries**

Create `src/lib/featureClassification.js`. `ALL_ROUTE_PATHS` is the exact set of feature routes from `src/App.jsx` (the routes rendered inside `<Layout>`, plus the four `EXTRA_ROUTES`). `CLASSIFICATION` starts with ONLY the four entries the registry already locked — every other path is intentionally absent so the coverage test stays red until the sweep classifies them.

```js
// src/lib/featureClassification.js
//
// THE AUDIT — a deliberate verdict for every route, per the wedge-alignment
// filter (spec §2). This is the single source of truth; featureRegistry.js
// derives its runtime exceptions from CLASSIFICATION. The coverage test in
// __tests__/featureClassification.test.js fails until every ALL_ROUTE_PATHS
// entry has a verdict here.
//
// Entry shape: { verdict: 'live'|'disabled'|'cut', dataSource, note, reason? }
//   reason (disabled): 'leaks' | 'server' | 'unverified'
//   reason (cut):      'off-wedge'
//   dataSource: short tag — 'wallet-core' | 'on-device' | 'base44-entities'
//               | 'external' | 'invented' | 'static' (purely informational copy)

// Canonical list of every feature route in App.jsx. Keep in sync with the
// router; the completeness test cross-checks CLASSIFICATION against it.
export const ALL_ROUTE_PATHS = [
  '/', '/send', '/receive', '/settings', '/connect', '/alerts', '/calculator',
  '/analytics', '/tax', '/security', '/security-dashboard', '/audit', '/nft',
  '/snapshots', '/pl', '/onchain', '/spending', '/advisor', '/smart-alerts',
  '/recurring', '/push', '/advanced-analytics', '/web3', '/nft-multichain',
  '/fraud', '/payment-links', '/risk', '/news-sentiment', '/notifications',
  '/savings', '/invoices', '/watchlist', '/ai-assistant', '/address-book',
  '/net-worth', '/benchmark', '/what-if', '/budget', '/duress-pin',
  '/wallet-access', '/stealth-wallets', '/panic-wipe', '/risk-score',
  '/correlation', '/split-bill', '/session-manager', '/receipt', '/tx-history',
  '/address-checker', '/fee-analytics', '/correlation-timeline',
  '/dashboard-widgets', '/shared-portfolio', '/referrals', '/wallet-seed-qr',
  '/hardware-wallet', '/biometric-auth', '/anomaly-detection', '/portfolio-rewind',
  '/index-builder', '/messenger-alerts', '/voice-commands', '/leaderboard',
  '/public-profiles', '/ai-rebalancer', '/token-approvals', '/network-manager',
  '/watch-wallets', '/price-charts', '/gas-fees', '/spam-filter', '/hd-wallet',
  '/trust-score', '/solana', '/crypto-signing', '/live-balances', '/dapp-alerts',
  '/security-scanner', '/erc20-discovery', '/products', '/docs', '/features',
  '/plans',
];

export const CLASSIFICATION = {
  // Already-locked decisions from the feature-registry PR (spec §4).
  '/leaderboard': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'A public ranking of who holds what is a targeting list aimed at our users. Removed on principle.',
  },
  '/public-profiles': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'Public identity and holdings exposure is the threat model we defend against, not a feature.',
  },
  '/shared-portfolio': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'Social portfolio sharing exposes holdings. A deliberate, encrypted signed export will replace it.',
  },
  '/referrals': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Referrals return once they can work without a server that links referrer and referee.',
  },
};
```

- [ ] **Step 4: Run it, verify it now FAILS ONLY on completeness**

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js`
Expected: The shape/reason tests PASS; the first test FAILS listing ~79 unclassified paths. This failing list is the sweep's work queue. (Tasks 3–10 drive it to green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/featureClassification.js src/lib/__tests__/featureClassification.test.js
git commit -m "feat: classification audit scaffold + coverage ratchet"
```

---

## Task 2: Derive the registry from the classification

**Files:**
- Modify: `src/lib/featureRegistry.js`
- Modify: `src/lib/__tests__/featureRegistry.test.js`

Make `CLASSIFICATION` the single source of truth: the registry's `disabled`/`cut` exceptions are computed from it. The existing registry tests are the regression guard — they must stay green **after one deliberate adjustment**: their `cutPaths()`/`disabledPaths()` assertions are written as *exact sets* of the original four entries, which will no longer hold once Tasks 3–10 add more entries. Step 4b loosens those two assertions to `contains` form (still guarding the original four decisions, but tolerant of growth). Every other registry assertion stays unchanged.

- [ ] **Step 1: Add a derivation export to `featureClassification.js`**

Append to `src/lib/featureClassification.js`:

```js
// Runtime registry exceptions derived from the audit: only non-live verdicts
// become registry entries (live/unlisted routes default to live). Verdict maps
// 1:1 to registry status. Carries reason + note through.
export function registryEntriesFromClassification() {
  const out = {};
  for (const [path, entry] of Object.entries(CLASSIFICATION)) {
    if (entry.verdict === 'live') continue;
    out[path] = { status: entry.verdict, reason: entry.reason, note: entry.note };
  }
  return out;
}
```

- [ ] **Step 2: Write a failing consistency test**

Add to `src/lib/__tests__/featureClassification.test.js`:

```js
import { getFeatureStatus } from '../featureRegistry';

describe('registry is consistent with the audit', () => {
  it('every non-live verdict is reflected in the runtime registry status', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'live') continue;
      expect(getFeatureStatus(path).status, path).toBe(entry.verdict);
    }
  });
});
```

- [ ] **Step 3: Run it, verify it FAILS**

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js`
Expected: FAIL on the new consistency test (registry still uses its own hand-written literal, which happens to match today, so it may PASS for the 4 entries — if it passes, that's fine, proceed; the binding becomes load-bearing once Task 3+ add entries).

- [ ] **Step 4: Replace the hand-written registry literal with the derived map**

In `src/lib/featureRegistry.js`, replace the `const FEATURE_REGISTRY = { ... }` literal (the four-entry object) with the derived value, and add the import at the top:

```js
import { registryEntriesFromClassification } from './featureClassification';
```

```js
// Runtime exceptions are derived from the classification audit (single source
// of truth). Unlisted paths still default to { status: 'live' }.
const FEATURE_REGISTRY = registryEntriesFromClassification();
```

Leave every helper (`getFeatureStatus`, `isLive`, `isDisabled`, `isCut`, `cutPaths`, `disabledPaths`, `featureRouteOutcome`, `REASONS`) and the `DEFAULT_ENTRY` exactly as-is.

- [ ] **Step 4b: Loosen the exact-set assertions in `featureRegistry.test.js`**

The merged test asserts the cut/disabled sets are *exactly* the original four. The sweep will add more, so change those two assertions from exact-equality to `contains` (guarding the original decisions without breaking on growth). Replace:

```js
  it('returns the expected sets', () => {
    expect(cutPaths().sort()).toEqual(
      ['/leaderboard', '/public-profiles', '/shared-portfolio'].sort(),
    );
    expect(disabledPaths().sort()).toEqual(['/referrals'].sort());
  });
```

with:

```js
  it('includes the originally-locked decisions', () => {
    for (const p of ['/leaderboard', '/public-profiles', '/shared-portfolio']) {
      expect(cutPaths()).toContain(p);
    }
    expect(disabledPaths()).toContain('/referrals');
  });
```

Leave all other assertions in that file unchanged.

- [ ] **Step 5: Run BOTH suites, verify all pass**

Run: `npx vitest run src/lib/__tests__/featureRegistry.test.js src/lib/__tests__/featureClassification.test.js`
Expected: PASS. The original registry tests (default-live `/send`, the three cuts, referrals disabled, `cutPaths`/`disabledPaths`) stay green — proving the derivation preserves behaviour.

- [ ] **Step 6: Commit**

```bash
git add src/lib/featureRegistry.js src/lib/featureClassification.js \
        src/lib/__tests__/featureClassification.test.js \
        src/lib/__tests__/featureRegistry.test.js
git commit -m "refactor: derive feature registry from the classification audit"
```

---

## Tasks 3–10: Classify by nav group

Each task below classifies the pages of one nav group. **The procedure is identical for every task** — only the page list changes:

1. For each path in the task's list, open its page component in `src/pages/` (the route→component mapping is in `src/App.jsx`).
2. Trace its data source and apply **The Rubric** above.
3. Add a `CLASSIFICATION[path]` entry: `{ verdict, dataSource, note, reason? }`. The `note` must state the concrete reason a human can verify (e.g. "reads base44.entities.X and labels it on-chain", or "runs wallet-core/foo locally — clean").
4. Run `npx vitest run src/lib/__tests__/featureClassification.test.js` — the unclassified-paths list shrinks.
5. Commit: `git commit -am "audit: classify <group> pages"`.

**Reviewer note (spec-compliance reviewer for these tasks):** verify each verdict by reading the page yourself — do not trust the note. The cardinal failure is marking a fabricating/mislabeled page `live`.

### Task 3 — Overview group
Paths: `/`, `/notifications`, `/analytics`, `/advanced-analytics`, `/advisor`, `/ai-assistant`, `/benchmark`, `/what-if`, `/risk-score`, `/correlation`, `/correlation-timeline`, `/dashboard-widgets`, `/news-sentiment`
(`/leaderboard`, `/public-profiles`, `/shared-portfolio`, `/referrals` already classified.)

### Task 4 — Wallet group
Paths: `/send`, `/receive`, `/tx-history`, `/payment-links`, `/split-bill`, `/receipt`, `/fee-analytics`, `/hd-wallet`, `/crypto-signing`, `/recurring`, `/calculator`

### Task 5 — Invest group
Paths: `/portfolio-rewind`, `/index-builder`, `/ai-rebalancer`, `/pl`, `/risk`

### Task 6 — Assets group
Paths: `/watchlist`, `/nft`, `/nft-multichain`, `/spending`, `/snapshots`, `/onchain`, `/erc20-discovery`
(`/onchain` worked example: `disabled`/`unverified`.)

### Task 7 — Finance group
Paths: `/savings`, `/budget`, `/net-worth`, `/invoices`, `/tax`

### Task 8 — Security group
Paths: `/security-dashboard`, `/security`, `/wallet-access`, `/session-manager`, `/duress-pin`, `/stealth-wallets`, `/panic-wipe`, `/address-checker`, `/wallet-seed-qr`, `/hardware-wallet`, `/dapp-alerts`, `/security-scanner`, `/biometric-auth`, `/anomaly-detection`, `/messenger-alerts`, `/voice-commands`, `/token-approvals`, `/spam-filter`, `/trust-score`, `/audit`, `/fraud`, `/smart-alerts`, `/alerts`
(`/trust-score` worked example: `live`. Expect most genuine self-custody/security features here to be `live`; scrutinise `/fraud`, `/messenger-alerts`, `/voice-commands` for server/fabrication dependencies.)

### Task 9 — Connect group
Paths: `/address-book`, `/watch-wallets`, `/live-balances`, `/network-manager`, `/solana`, `/price-charts`, `/gas-fees`, `/connect`, `/web3`, `/push`
(Expect indexer/RPC dependencies here — many likely `disabled`/`leaks`.)

### Task 10 — Core + Preferences (remaining routes)
Paths: `/settings`, `/docs`, `/features`, `/products`, `/plans`.
These are core/preferences pages (`/docs`, `/features`, `/products` are mostly `static` informational copy — verdict usually `live` if the copy is accurate, but check `/features` and `/products` don't claim unbuilt features as available; `/plans` shows tier copy — `live`). Before finishing, run `npx vitest run src/lib/__tests__/featureClassification.test.js` and classify EXACTLY any paths it still reports as missing, so nothing is skipped.

---

## Task 11: Apply, verify, and lock

**Files:** none new (verification + a final guard test)

- [ ] **Step 1: Confirm completeness**

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js`
Expected: PASS — zero unclassified paths, registry consistent with the audit.

- [ ] **Step 2: Add a fabricator guard test**

Add to `src/lib/__tests__/featureClassification.test.js` — locks the cardinal-sin invariant so a future edit can't silently re-enable a fabricating page:

```js
describe('no fabricating/off-wedge page is live', () => {
  it('every unverified or off-wedge verdict is gated (not live) in the registry', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.reason === 'unverified' || entry.reason === 'off-wedge') {
        expect(getFeatureStatus(path).status, path).not.toBe('live');
      }
    }
  });
});
```

Run: `npx vitest run src/lib/__tests__/featureClassification.test.js` — expect PASS.

- [ ] **Step 3: Full suite + lint + build**

Run: `npm test` (expect all green, incl. the RNG pretest guard), then `npm run lint` (clean), then `npx vite build` (exit 0).

- [ ] **Step 4: Manual smoke (recommended)**

`npm run dev`, then spot-check three routes the sweep moved to `disabled`: each must render the honest notice (from the merged `FeatureRoute`/`HonestDisabledPage`), not the old fabricated/mislabeled screen. Confirm a `live` page (e.g. `/duress-pin`) is unchanged.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "test: lock fabricators/off-wedge pages out of live state"
```

---

## Self-Review notes (for the plan author / final reviewer)
- The audit covers every route via `ALL_ROUTE_PATHS`; the coverage test makes "did we miss a page?" mechanically answerable.
- Single source of truth: verdicts live only in `CLASSIFICATION`; the registry derives. No drift possible (consistency test).
- `ALL_ROUTE_PATHS` must match `App.jsx`. If a route is added/removed there later, the completeness test will flag the mismatch — keep them in sync (a future improvement is to generate the router from this list, out of scope here).
- Verdicts are judgment, gated by per-task spec-review (read the page, don't trust the note) and the fabricator guard test.
