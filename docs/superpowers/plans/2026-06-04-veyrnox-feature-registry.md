# Veyrnox Feature Registry & Honest-Disable Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single source-of-truth feature registry that classifies every route as `live` / `disabled` / `cut`, drive nav + routing from it, and use it to enforce the social-feature cuts the spec already locked.

**Architecture:** A pure data+helper module (`src/lib/featureRegistry.js`) holds the classification. `navigation.js` filters `cut` paths out of nav and search. A thin `<FeatureRoute>` gate consults the registry at the route level: `cut` → Not Found, `disabled` → honest notice, `live` → the page unchanged. Anything not listed defaults to `live`, so adding the registry changes no existing behaviour except the explicit entries.

**Tech Stack:** React 18, react-router-dom v6, Vitest (pure-function tests, jsdom available but not required here), lucide-react icons, `@/` import alias.

**Source spec:** `docs/superpowers/specs/2026-06-04-veyrnox-positioning-scope-design.md` (§2 filter, §4 social verdict).

**Execution note:** Run this on a fresh feature branch (e.g. `feat/feature-registry`), NOT the `docs/*` branch the spec was committed on.

---

## File Structure

**Create:**
- `src/lib/featureRegistry.js` — classification data + pure helpers (`getFeatureStatus`, `isCut`, `isDisabled`, `cutPaths`, `disabledPaths`, `featureRouteOutcome`, `REASONS`).
- `src/lib/__tests__/featureRegistry.test.js` — registry unit tests.
- `src/lib/__tests__/navigation.test.js` — asserts `cut` paths are absent from nav/search and `disabled` stays visible.
- `src/components/HonestDisabledPage.jsx` — registry-driven full-page honest notice.
- `src/components/FeatureRoute.jsx` — route gate consuming the registry.

**Modify:**
- `src/lib/navigation.js` — filter `cut` paths from `navGroups` (and therefore `searchableRoutes`).
- `src/App.jsx` — wrap the four decided routes (`/leaderboard`, `/public-profiles`, `/shared-portfolio`, `/referrals`) in `<FeatureRoute>`.

**Out of scope (follow-on plans):** identifying the ~6–8 fabricators, triaging the 40 shells, wiring Pile 1, building the signed local export, deleting quarantined page files, updating tier copy to Free/Pro/SHIELD/Guardian.

---

## Task 1: Feature registry module

**Files:**
- Create: `src/lib/featureRegistry.js`
- Test: `src/lib/__tests__/featureRegistry.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/featureRegistry.test.js
import { describe, it, expect } from 'vitest';
import {
  getFeatureStatus,
  isLive,
  isDisabled,
  isCut,
  cutPaths,
  disabledPaths,
  featureRouteOutcome,
  REASONS,
} from '../featureRegistry';

describe('getFeatureStatus', () => {
  it('defaults unknown paths to live', () => {
    expect(getFeatureStatus('/send')).toEqual({ status: 'live' });
    expect(isLive('/send')).toBe(true);
  });

  it('classifies the targeting-vector social pages as cut (spec §4)', () => {
    expect(getFeatureStatus('/leaderboard').status).toBe('cut');
    expect(getFeatureStatus('/public-profiles').status).toBe('cut');
    expect(getFeatureStatus('/shared-portfolio').status).toBe('cut');
    expect(isCut('/leaderboard')).toBe(true);
  });

  it('classifies referrals as disabled pending a serverless build (spec §4)', () => {
    const entry = getFeatureStatus('/referrals');
    expect(entry.status).toBe('disabled');
    expect(entry.reason).toBe(REASONS.SERVER);
    expect(isDisabled('/referrals')).toBe(true);
  });

  it('every cut/disabled entry carries a user-facing note', () => {
    for (const path of [...cutPaths(), ...disabledPaths()]) {
      expect(typeof getFeatureStatus(path).note).toBe('string');
      expect(getFeatureStatus(path).note.length).toBeGreaterThan(0);
    }
  });
});

describe('cutPaths / disabledPaths', () => {
  it('returns the expected sets', () => {
    expect(cutPaths().sort()).toEqual(
      ['/leaderboard', '/public-profiles', '/shared-portfolio'].sort(),
    );
    expect(disabledPaths()).toEqual(['/referrals']);
  });
});

describe('featureRouteOutcome', () => {
  it('maps status to a render outcome', () => {
    expect(featureRouteOutcome('/send')).toBe('render');
    expect(featureRouteOutcome('/referrals')).toBe('disabled');
    expect(featureRouteOutcome('/leaderboard')).toBe('notFound');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/featureRegistry.test.js`
Expected: FAIL — `Cannot find module '../featureRegistry'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/featureRegistry.js
//
// SINGLE SOURCE OF TRUTH for each route's honesty classification, per the
// wedge-alignment filter in
// docs/superpowers/specs/2026-06-04-veyrnox-positioning-scope-design.md (§2).
//
// status:
//   'live'     — passes all four gates; renders normally.
//   'disabled' — belongs to the product but can't be done cleanly yet (fails the
//                clean-data-path / server-honesty / verified gate). Stays visible
//                in nav and renders an honest notice instead of fabricated data.
//   'cut'      — does not serve the coercion-resistant-vault job. Removed from nav
//                and search; the route resolves to Not Found.
//
// Anything NOT listed here defaults to { status: 'live' } — adding the registry
// disables nothing by itself; only explicit entries change behaviour.

// User-facing reason codes (drive the notice heading in HonestDisabledPage).
export const REASONS = {
  LEAKS: 'leaks',           // needs a third-party indexer that would reveal your address
  SERVER: 'server',         // needs a backend this build doesn't ship
  UNVERIFIED: 'unverified', // not yet verified against real on-chain data
  OFF_WEDGE: 'off-wedge',   // exposes holdings/identity — a targeting vector
};

// Explicit classifications. Seeded with the cuts the spec already locked (§4).
export const FEATURE_REGISTRY = {
  '/leaderboard': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'A public ranking of who holds what is a targeting list aimed at our users. Removed on principle.',
  },
  '/public-profiles': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'Public identity and holdings exposure is the threat model we defend against, not a feature.',
  },
  '/shared-portfolio': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'Social portfolio sharing exposes holdings. A deliberate, encrypted signed export will replace it.',
  },
  '/referrals': {
    status: 'disabled',
    reason: REASONS.SERVER,
    note: 'Referrals return once they can work without a server that links referrer and referee.',
  },
};

const DEFAULT_ENTRY = { status: 'live' };

export function getFeatureStatus(path) {
  return FEATURE_REGISTRY[path] || DEFAULT_ENTRY;
}

export function isLive(path) {
  return getFeatureStatus(path).status === 'live';
}
export function isDisabled(path) {
  return getFeatureStatus(path).status === 'disabled';
}
export function isCut(path) {
  return getFeatureStatus(path).status === 'cut';
}

export function cutPaths() {
  return Object.keys(FEATURE_REGISTRY).filter(isCut);
}
export function disabledPaths() {
  return Object.keys(FEATURE_REGISTRY).filter(isDisabled);
}

// Pure mapping from a path to how <FeatureRoute> should render it. Extracted so
// the gate's branching is unit-tested without rendering React.
export function featureRouteOutcome(path) {
  const { status } = getFeatureStatus(path);
  if (status === 'cut') return 'notFound';
  if (status === 'disabled') return 'disabled';
  return 'render';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/featureRegistry.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/featureRegistry.js src/lib/__tests__/featureRegistry.test.js
git commit -m "feat: feature registry classifying routes live/disabled/cut"
```

---

## Task 2: Honest-disabled page component

**Files:**
- Create: `src/components/HonestDisabledPage.jsx`

This is a thin, presentational component that reads the registry. The repo has no React Testing Library, so it is verified by build + the registry tests behind it (consistent with the codebase's pure-function-only test style). No render test.

- [ ] **Step 1: Write the component**

```jsx
// src/components/HonestDisabledPage.jsx
//
// Full-page honest notice for a route classified 'disabled' in the feature
// registry. It reads the registry entry for the current path and explains WHY
// the feature is off, rather than showing fabricated data. Visual language
// mirrors components/LocalBuildNotice.jsx.
import { CloudOff } from 'lucide-react';
import { getFeatureStatus } from '@/lib/featureRegistry';

const HEADINGS = {
  leaks: 'Off by default to protect your privacy',
  server: 'Not available in this build',
  unverified: 'Not yet verified',
  'off-wedge': 'Removed',
};

export default function HonestDisabledPage({ path }) {
  const entry = getFeatureStatus(path);
  const heading = HEADINGS[entry.reason] || 'Not available yet';
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
      <CloudOff className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">{heading}</p>
        <p className="text-muted-foreground mt-1">
          {entry.note || 'This feature is disabled until it can be done honestly.'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx vite build`
Expected: Build completes with no error referencing `HonestDisabledPage`. (A clean build confirms imports/JSX resolve.)

- [ ] **Step 3: Commit**

```bash
git add src/components/HonestDisabledPage.jsx
git commit -m "feat: registry-driven honest-disabled page notice"
```

---

## Task 3: FeatureRoute gate component

**Files:**
- Create: `src/components/FeatureRoute.jsx`

Branching logic is already unit-tested via `featureRouteOutcome` (Task 1). This component is the thin React binding.

- [ ] **Step 1: Write the component**

```jsx
// src/components/FeatureRoute.jsx
//
// Route-level enforcement of the feature registry (defence in depth — cut items
// are also removed from nav). Consults featureRouteOutcome() for the current
// path:
//   'notFound' (cut)      -> render PageNotFound
//   'disabled'            -> render the honest notice instead of the page
//   'render' (live)       -> render the page unchanged
import { featureRouteOutcome } from '@/lib/featureRegistry';
import HonestDisabledPage from './HonestDisabledPage';
import PageNotFound from '@/lib/PageNotFound';

export default function FeatureRoute({ path, children }) {
  const outcome = featureRouteOutcome(path);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={path} />;
  return children;
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx vite build`
Expected: Build completes with no error referencing `FeatureRoute`.

- [ ] **Step 3: Commit**

```bash
git add src/components/FeatureRoute.jsx
git commit -m "feat: FeatureRoute gate enforcing the registry at route level"
```

---

## Task 4: Filter cut features out of navigation

**Files:**
- Modify: `src/lib/navigation.js`
- Test: `src/lib/__tests__/navigation.test.js`

`searchableRoutes` is derived from `navGroups`, so filtering `navGroups` cleans search automatically. `disabled` items stay (they remain reachable and render the notice).

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/navigation.test.js
import { describe, it, expect } from 'vitest';
import { navGroups, searchableRoutes } from '../navigation';

const allNavPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

describe('navigation respects the feature registry', () => {
  it('drops every cut path from the sidebar/More nav', () => {
    expect(allNavPaths).not.toContain('/leaderboard');
    expect(allNavPaths).not.toContain('/public-profiles');
    expect(allNavPaths).not.toContain('/shared-portfolio');
  });

  it('drops every cut path from search', () => {
    const searchPaths = searchableRoutes.map((r) => r.path);
    expect(searchPaths).not.toContain('/leaderboard');
    expect(searchPaths).not.toContain('/public-profiles');
    expect(searchPaths).not.toContain('/shared-portfolio');
  });

  it('keeps disabled features visible (referrals still in nav)', () => {
    expect(allNavPaths).toContain('/referrals');
  });

  it('leaves live features untouched', () => {
    expect(allNavPaths).toContain('/send');
    expect(allNavPaths).toContain('/duress-pin');
  });

  it('drops no group entirely (no empty groups rendered)', () => {
    expect(navGroups.every((g) => g.items.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/navigation.test.js`
Expected: FAIL — `/leaderboard`, `/public-profiles`, `/shared-portfolio` are still present in `navGroups`.

- [ ] **Step 3: Apply the filter in `navigation.js`**

Add the registry import near the top of `src/lib/navigation.js`, immediately after the lucide-react import block (after line 28):

```js
import { isCut } from './featureRegistry';
```

Rename the existing `export const navGroups = [ ... ];` array (lines 44–159) to a non-exported `const RAW_NAV_GROUPS = [ ... ];` (change ONLY the declaration line — the array contents stay identical):

```js
const RAW_NAV_GROUPS = [
```

Then immediately after the closing `];` of that array (after line 159), add the filtered export:

```js
// Cut features (feature registry) are removed from nav + search entirely; the
// route also resolves to Not Found via <FeatureRoute>. Disabled features stay
// visible here and render an honest notice when opened. Empty groups are dropped.
export const navGroups = RAW_NAV_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => !isCut(item.path)) }))
  .filter((group) => group.items.length > 0);
```

Leave the `searchableRoutes` export (lines 176–181) unchanged — it already derives from `navGroups` and will pick up the filter.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/navigation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation.js src/lib/__tests__/navigation.test.js
git commit -m "feat: hide cut features from nav and search via the registry"
```

---

## Task 5: Enforce the decided routes in App.jsx

**Files:**
- Modify: `src/App.jsx`

Wrap the four decided routes in `<FeatureRoute>`. The component handles cut→Not Found and disabled→notice; live routes elsewhere are untouched.

- [ ] **Step 1: Add the FeatureRoute import**

In `src/App.jsx`, after the `import Layout from './components/Layout';` line (line 12), add:

```js
import FeatureRoute from '@/components/FeatureRoute';
```

- [ ] **Step 2: Wrap the four decided routes**

Replace these four route lines in `src/App.jsx` (currently lines 172–173, 182–183):

```jsx
          <Route path="/shared-portfolio" element={<SharedPortfolioView />} />
          <Route path="/referrals" element={<ReferralTracker />} />
```
```jsx
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/public-profiles" element={<PublicProfiles />} />
```

with their gated equivalents:

```jsx
          <Route path="/shared-portfolio" element={<FeatureRoute path="/shared-portfolio"><SharedPortfolioView /></FeatureRoute>} />
          <Route path="/referrals" element={<FeatureRoute path="/referrals"><ReferralTracker /></FeatureRoute>} />
```
```jsx
          <Route path="/leaderboard" element={<FeatureRoute path="/leaderboard"><Leaderboard /></FeatureRoute>} />
          <Route path="/public-profiles" element={<FeatureRoute path="/public-profiles"><PublicProfiles /></FeatureRoute>} />
```

(The lazy imports for these pages stay in place — quarantine, not deletion. Hard deletion of cut page files is a follow-on plan.)

- [ ] **Step 3: Verify it builds**

Run: `npx vite build`
Expected: Build completes cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: gate cut/disabled routes through FeatureRoute"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite (includes the RNG guard via pretest)**

Run: `npm test`
Expected: PASS — all existing suites plus `featureRegistry` and `navigation` green. The `pretest` RNG guard (`check:rng`) passes first.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No new errors. (If `eslint-plugin-unused-imports` flags a quarantined page import as unused, that is expected to NOT fire because the lazy imports are still referenced by their routes.)

- [ ] **Step 3: Production build**

Run: `npx vite build`
Expected: Clean build.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run: `npm run dev`, then in the browser:
- Confirm "Leaderboard", "Public Profile", and "Share Portfolio" no longer appear in the sidebar, the mobile More drawer, or ⌘K search.
- Navigate directly to `/leaderboard` → see the Not Found page.
- Navigate directly to `/referrals` → see the honest "Referrals return once they can work without a server…" notice, NOT the old shell.
- Confirm a live page (e.g. `/send`, `/duress-pin`) is unchanged.

- [ ] **Step 5: Final commit (if smoke check prompted any copy tweaks)**

```bash
git add -A
git commit -m "chore: feature registry verification pass"
```

---

## Follow-on plans (not this plan)

1. **Fabricator classification sweep** — read every page, apply the §2 four-gate filter, and record each verdict in `FEATURE_REGISTRY`. Immediately set the ~6–8 fabricators to `disabled` (reason `UNVERIFIED`/`LEAKS`). A test asserts every route in `App.jsx` has a deliberate registry decision.
2. **Wire Pile 1 shells** — connect shells with a clean data path (on-device / user-RPC) to real data; flip them to `live`.
3. **Signed local export** — build the encrypted, user-initiated portfolio export that replaces the cut `/shared-portfolio`.
4. **Hard-cut quarantined pages** — delete the page files + lazy imports for confirmed `cut` routes.
5. **Tier copy update** — `tier.js` + the Subscription page to Free / Pro / SHIELD / Guardian per spec §5.
