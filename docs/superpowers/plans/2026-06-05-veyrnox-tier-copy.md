# Veyrnox Tier Copy — Free / Pro / SHIELD / Guardian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the display-only tier model and plans UI to the two-axis structure from the spec (Free / Pro / SHIELD software ladder + Guardian service), and reconcile the feature catalog so the cut social pages are no longer advertised as "roadmap."

**Architecture:** `tier.js` holds the display-only tier catalogue (`TIERS`) and the Pro feature list — extend it to four tiers, preserving the honesty rule (only *already-built* features may be listed under a tier; everything else is preview/roadmap copy). `TierProvider` passes `TIERS` through unchanged. `Subscription.jsx` (`/plans`) renders the cards — extend to four and add an honest SHIELD preview card. `Features.jsx` and `Documentation.jsx` carry feature catalogs that still list cut social pages — remove them.

**Tech Stack:** React 18, Vitest (pure-function data test for `tier.js`; presentational pages verified by build, per repo convention — no React Testing Library).

**Source spec:** `docs/superpowers/specs/2026-06-04-veyrnox-positioning-scope-design.md` (§5 monetization, §4 social cuts).

**No external prerequisite:** this plan touches `tier.js`, `Subscription.jsx`, `Features.jsx`, `Documentation.jsx` — none of which depend on the feature registry. Execute on its own branch from `main` (e.g. `feat/tier-copy`).

**Honesty rule (do not violate):** a tier card may only *list as included* features that already work today. SHIELD's distinguishing features (inheritance / dead-man's-switch, software social-recovery, multi-device, air-gapped companion) are NOT built — so SHIELD shows a tagline + an honest "preview / on the roadmap" note, never a fabricated feature list. This mirrors how the Guardian card already behaves.

---

## File Structure

**Modify:**
- `src/lib/tier.js` — `TIERS` becomes four entries (free/pro/shield/guardian) with §5 taglines; header comment updated to describe the two-axis model; `PRO_FEATURES` unchanged (all "protect-the-present" built features stay under Pro).
- `src/pages/Subscription.jsx` — render four cards (responsive grid), add a SHIELD preview branch, update Free + Guardian copy.
- `src/pages/Features.jsx` — remove `Leaderboard` and `Public Profiles` from the Social category; reframe `Referral Tracker` honestly.
- `src/pages/Documentation.jsx` — same Social-category reconciliation.

**Create:**
- `src/lib/__tests__/tier.test.js` — locks the tier catalogue shape and the honesty rule (Pro lists only built features).

---

## Task 1: Tier catalogue → four tiers (two axes)

**Files:**
- Modify: `src/lib/tier.js`
- Test: `src/lib/__tests__/tier.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/tier.test.js
import { describe, it, expect } from 'vitest';
import { getCurrentTier, TIERS, PRO_FEATURES } from '../tier';

describe('tier catalogue', () => {
  it('is the four-tier two-axis model in order: free, pro, shield, guardian', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'pro', 'shield', 'guardian']);
  });

  it('every tier has a name, price, and tagline', () => {
    for (const t of TIERS) {
      expect(t.name, `${t.id} name`).toBeTruthy();
      expect(t.price, `${t.id} price`).toBeTruthy();
      expect(t.tagline, `${t.id} tagline`).toBeTruthy();
    }
  });

  it('current tier is still the stubbed free (no billing exists)', () => {
    expect(getCurrentTier()).toBe('free');
  });

  it('honesty rule: Pro lists ONLY already-built features', () => {
    expect(PRO_FEATURES.length).toBeGreaterThan(0);
    for (const f of PRO_FEATURES) {
      expect(f.status, `${f.name} status`).toBe('available');
    }
  });
});
```

- [ ] **Step 2: Run it, verify it FAILS**

Run: `npx vitest run src/lib/__tests__/tier.test.js`
Expected: FAIL — `TIERS.map(...)` is `['free','pro','guardian']`, missing `'shield'`.

- [ ] **Step 3: Update `TIERS` and the header comment in `src/lib/tier.js`**

Replace the `export const TIERS = [ ... ];` block (the three-entry array) with:

```js
// The tiers shown on the plans screen. Two AXES, not one ladder (spec §5):
//   - Software axis (DIY):  Free -> Pro -> SHIELD. More money = more protection depth.
//   - Service axis:         Guardian sits ON TOP of the software (it INCLUDES SHIELD
//                           and adds humans) — it is not a higher software rung.
// Life-safety security (duress PIN, panic wipe, decoy balances) is FREE on principle.
// Prices are a WORKING MODEL, not final, and nothing here grants access to anything —
// it is copy for the cards. Pro = harden the present; SHIELD = harden across time,
// devices and succession; Guardian = our team operates it with you.
export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'The full self-custody wallet plus all life-safety security. No account required.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '~$5-8/mo, not final',
    tagline: 'Harden your wallet day to day.',
  },
  {
    id: 'shield',
    name: 'SHIELD',
    price: 'Top software tier — price TBC',
    tagline: 'Harden across time, devices, and succession.',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    price: '$100+/mo, by application',
    tagline: 'Our security team operates it with you.',
  },
];
```

Leave `getCurrentTier()` and `PRO_FEATURES` unchanged (the five built features stay under Pro — they are all "protect-the-present" tooling).

- [ ] **Step 4: Run it, verify it PASSES**

Run: `npx vitest run src/lib/__tests__/tier.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tier.js src/lib/__tests__/tier.test.js
git commit -m "feat: four-tier two-axis model (Free/Pro/SHIELD/Guardian)"
```

---

## Task 2: Plans page renders four cards + honest SHIELD preview

**Files:**
- Modify: `src/pages/Subscription.jsx`

Presentational; verified by build (no RTL in repo).

- [ ] **Step 1: Widen the card grid for four tiers**

In `src/pages/Subscription.jsx`, change the grid wrapper:

```jsx
      <div className="grid gap-4 md:grid-cols-3">
```
to:
```jsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
```

- [ ] **Step 2: Add the SHIELD preview branch and update Free/Guardian copy**

In the `<CardContent>`, the per-id blocks currently cover `pro`, `free`, and `guardian`. Replace the `free` and `guardian` blocks and add a `shield` block. Replace:

```jsx
                {tier.id === "free" && (
                  <p className="text-sm text-muted-foreground">
                    Everything you need to self-custody — all the wallet features
                    available today, at no cost.
                  </p>
                )}
                {tier.id === "guardian" && (
                  <p className="text-sm text-muted-foreground">
                    A high-touch tier offered by application. Details to be
                    confirmed; this card is a preview only.
                  </p>
                )}
```

with:

```jsx
                {tier.id === "free" && (
                  <p className="text-sm text-muted-foreground">
                    The complete self-custody wallet plus all life-safety security
                    (duress PIN, panic wipe, decoy balances) — at no cost, on principle.
                  </p>
                )}
                {tier.id === "shield" && (
                  <p className="text-sm text-muted-foreground">
                    Everything in Pro, extended across time, devices and succession.
                    Its distinguishing features (inheritance, software recovery,
                    multi-device) are on the roadmap — this card is a preview only.
                  </p>
                )}
                {tier.id === "guardian" && (
                  <p className="text-sm text-muted-foreground">
                    Not a higher software rung — the SHIELD software plus a security
                    team that operates it with you. Offered by application; details
                    to be confirmed, preview only.
                  </p>
                )}
```

(The `tier.id === "pro"` block that maps `PRO_FEATURES` stays exactly as-is.)

- [ ] **Step 3: Verify build**

Run: `npx vite build`
Expected: clean (exit 0), no error referencing `Subscription`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Subscription.jsx
git commit -m "feat: plans page shows four tiers with honest SHIELD preview"
```

---

## Task 3: Reconcile Features.jsx catalog with the social cuts

**Files:**
- Modify: `src/pages/Features.jsx`

The Social category lists `Referral Tracker`, `Leaderboard`, `Public Profiles` as `roadmap`. Leaderboard and Public Profiles are CUT (spec §4) — they are not "coming soon," they are deliberately not built. Remove them. Reframe Referral to state it only returns if it can be done without a server.

- [ ] **Step 1: Replace the Social category block**

In `src/pages/Features.jsx`, replace the entire Social category object:

```jsx
  {
    category: "Social",
    features: [
      {
        name: "Referral Tracker",
        status: "roadmap",
        summary: "Track referral sign-ups",
        explanation: "Generate referral links and track sign-ups. Specced, not yet built, with privacy caveats."
      },
      {
        name: "Leaderboard",
        status: "roadmap",
        summary: "Opt-in performance ranking",
        explanation: "Opt-in ranking of participating users. Specced, not yet built, with privacy caveats."
      },
      {
        name: "Public Profiles",
        status: "roadmap",
        summary: "Opt-in shareable profile",
        explanation: "An opt-in, privacy-controlled public profile. Specced, not yet built, with privacy caveats."
      }
    ]
  },
```

with (Leaderboard + Public Profiles removed; Referral reframed honestly):

```jsx
  {
    category: "Referrals",
    features: [
      {
        name: "Referral Tracker",
        status: "roadmap",
        summary: "Privacy-preserving referrals (if buildable serverlessly)",
        explanation: "Public ranking and public-profile features were cut on principle — a wallet must not publish who holds what. Referrals are kept only as a future option, and only if they can work without a server that links referrer and referee."
      }
    ]
  },
```

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: clean (exit 0). The available/roadmap counts on the page recompute automatically from the catalog.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Features.jsx
git commit -m "docs: drop cut social pages from Features catalog"
```

---

## Task 4: Reconcile Documentation.jsx catalog with the social cuts

**Files:**
- Modify: `src/pages/Documentation.jsx`

- [ ] **Step 1: Replace the Social category items**

In `src/pages/Documentation.jsx`, replace the Social category block:

```jsx
  { category: "Social", icon: Users, items: [
    { name: "Referral Tracker", desc: "Track referral sign-ups (privacy caveats)", status: "roadmap" },
    { name: "Leaderboard", desc: "Opt-in performance ranking", status: "roadmap" },
    { name: "Public Profiles", desc: "Opt-in, privacy-controlled profile", status: "roadmap" },
  ]},
```

with:

```jsx
  { category: "Referrals", icon: Users, items: [
    { name: "Referral Tracker", desc: "Kept only if buildable serverlessly; ranking/profiles cut on principle", status: "roadmap" },
  ]},
```

(The `Users` icon import is already present and still used — no import change needed.)

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Documentation.jsx
git commit -m "docs: drop cut social pages from Documentation catalog"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite (incl. RNG pretest guard)**

Run: `npm test`
Expected: all green, including the new `tier` suite.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean. (If `eslint-plugin-unused-imports` flags `Users` in Documentation.jsx as unused, confirm the reconciled category still uses it — it does — so no change needed.)

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: exit 0.

- [ ] **Step 4: Manual smoke (recommended)**

`npm run dev`, open `/plans`: confirm four cards (Free / Pro / SHIELD / Guardian), SHIELD shows the preview note (no fabricated feature list), Free mentions free life-safety, Guardian frames itself as service-on-top. Open `/features` and `/docs`: confirm Leaderboard and Public Profiles no longer appear.

- [ ] **Step 5: Final commit (only if smoke prompted tweaks)**

```bash
git add -A
git commit -m "chore: tier copy verification pass"
```

---

## Out of scope (other plans)
- Real billing / IAP entitlement (the tier stays stubbed `free`; `tier.js` already documents that real verified-receipt billing replaces `getCurrentTier()`).
- SHIELD's distinguishing continuity features (inheritance, software recovery, multi-device) — separate build plans; only then do they get listed as included under SHIELD.
- Guardian service operations / onboarding.
