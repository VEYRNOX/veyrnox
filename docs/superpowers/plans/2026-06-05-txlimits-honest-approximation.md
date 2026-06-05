# Honest Approximation for Spend-Cap USD Figures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every USD figure derived from the static `USD_RATES` table as visibly approximate (`≈$`) while user-entered caps stay exact, without changing any enforcement behaviour.

**Architecture:** Add one `approxUsd(n)` formatter in `src/lib/cryptos.js` (next to `USD_REFERENCE_NOTE`), then route the two converted-USD display sites (`SecurityCenter.jsx`, `SendCrypto.jsx`) through it. Correct a false comment in `txLimits.js`. Pure presentation + comments — `evaluateSendAgainstLimits` / `sumSentTodayUSD` / `toUsd` logic is untouched, which the unchanged `txLimits` test suite proves.

**Tech Stack:** React (JSX), Vitest (jsdom), `@/` path alias (mirrors `jsconfig.json`).

Spec: `docs/superpowers/specs/2026-06-05-txlimits-honest-approximation-design.md`

---

### Task 1: `approxUsd` formatter (TDD)

**Files:**
- Create: `src/lib/__tests__/cryptos.test.js`
- Modify: `src/lib/cryptos.js` (insert after the `USD_REFERENCE_NOTE` export, currently line 46)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/cryptos.test.js`:

```js
// lib/__tests__/cryptos.test.js
//
// Unit tests for approxUsd — the display formatter for any USD figure DERIVED
// from the static USD_RATES table. It marks the number approximate (≈) and
// rounds to whole dollars, so a reference-rate value is never shown as exact.

import { describe, it, expect } from 'vitest';
import { approxUsd } from '@/lib/cryptos';

describe('approxUsd', () => {
  it('prefixes with ≈ and rounds to whole dollars', () => {
    expect(approxUsd(1650.4)).toBe('≈$1,650');
  });

  it('rounds at the half dollar', () => {
    expect(approxUsd(0.6)).toBe('≈$1');
  });

  it('adds thousands separators', () => {
    expect(approxUsd(1234567)).toBe('≈$1,234,567');
  });

  it('renders sub-dollar and zero values as ≈$0', () => {
    expect(approxUsd(0.004)).toBe('≈$0');
    expect(approxUsd(0)).toBe('≈$0');
  });

  it('guards non-finite and negative input as ≈$0', () => {
    expect(approxUsd(NaN)).toBe('≈$0');
    expect(approxUsd(Infinity)).toBe('≈$0');
    expect(approxUsd(-Infinity)).toBe('≈$0');
    expect(approxUsd(-5)).toBe('≈$0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/cryptos.test.js`
Expected: FAIL — `approxUsd` is not exported (`approxUsd is not a function`).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/cryptos.js`, insert immediately after the `USD_REFERENCE_NOTE` export (after current line 46, before the `CURRENCY_COLORS` comment):

```js
/**
 * Format a USD figure that was DERIVED from the static USD_RATES table, marked
 * approximate (≈) and rounded to whole dollars, so a reference-rate number is
 * never shown as an exact amount. Pairs with USD_REFERENCE_NOTE: that discloses
 * WHY the figure is approximate, this renders the number itself. Use ONLY for
 * converted values — NEVER for user-entered caps, which are exact. Non-finite,
 * zero, sub-dollar, and negative inputs all render as "≈$0".
 */
export function approxUsd(usd) {
  const n = Number(usd);
  const dollars = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  return `≈$${dollars.toLocaleString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/cryptos.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/cryptos.test.js src/lib/cryptos.js
git commit -m "feat(usd): add approxUsd formatter for reference-rate figures"
```

---

### Task 2: Route SecurityCenter "spent today" through `approxUsd`

This is the actual honesty gap: the converted "Sent today" total is currently
shown as exact `$X`. The cap (`l.daily_limit`) is user-entered and stays exact.

**Files:**
- Modify: `src/pages/SecurityCenter.jsx` (import line 1; render ~line 232)

- [ ] **Step 1: Extend the cryptos import**

Replace (line 1):

```js
import { USD_RATES } from "@/lib/cryptos";
```

with:

```js
import { USD_RATES, approxUsd } from "@/lib/cryptos";
```

- [ ] **Step 2: Mark the converted total approximate**

Replace the `<span>` value line (currently line 232):

```jsx
                            ${Math.round(spent).toLocaleString()} / ${l.daily_limit.toLocaleString()}
```

with:

```jsx
                            {approxUsd(spent)} / ${l.daily_limit.toLocaleString()}
```

(`spent` is the `USD_RATES`-derived value → approximate; `l.daily_limit` is the
user-entered cap → exact.)

- [ ] **Step 3: Verify it compiles**

Run: `npx eslint src/pages/SecurityCenter.jsx --quiet`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SecurityCenter.jsx
git commit -m "feat(usd): mark SecurityCenter 'sent today' total as approximate (≈\$)"
```

---

### Task 3: Route SendCrypto breach warnings through `approxUsd`

SendCrypto already prefixes converted values with an ad-hoc `~$`. Standardise
the four occurrences on `approxUsd` (`≈$`). Cap values (`r.limitUSD`) stay exact.

**Files:**
- Modify: `src/pages/SendCrypto.jsx` (import line 1; messages ~lines 627-628)

- [ ] **Step 1: Extend the cryptos import**

Replace (line 1):

```js
import { USD_RATES } from "@/lib/cryptos";
```

with:

```js
import { USD_RATES, approxUsd } from "@/lib/cryptos";
```

- [ ] **Step 2: Replace the two breach-message templates**

Replace this block (currently lines 627-628):

```jsx
                    ? `This send (~$${Math.round(limitEval.amountUSD).toLocaleString()}) exceeds your ${r.currency === "ALL" ? "" : r.currency + " "}per-transaction cap of $${r.limitUSD.toLocaleString()}.`
                    : `You've already sent ~$${Math.round(r.spentTodayUSD).toLocaleString()} today; this send (~$${Math.round(limitEval.amountUSD).toLocaleString()}) would reach ~$${Math.round(r.projectedUSD).toLocaleString()}, over your ${r.currency === "ALL" ? "" : r.currency + " "}daily cap of $${r.limitUSD.toLocaleString()}.`}
```

with:

```jsx
                    ? `This send (${approxUsd(limitEval.amountUSD)}) exceeds your ${r.currency === "ALL" ? "" : r.currency + " "}per-transaction cap of $${r.limitUSD.toLocaleString()}.`
                    : `You've already sent ${approxUsd(r.spentTodayUSD)} today; this send (${approxUsd(limitEval.amountUSD)}) would reach ${approxUsd(r.projectedUSD)}, over your ${r.currency === "ALL" ? "" : r.currency + " "}daily cap of $${r.limitUSD.toLocaleString()}.`}
```

(All three converted values — `amountUSD`, `spentTodayUSD`, `projectedUSD` — now
render via `approxUsd`; both `r.limitUSD` caps stay exact `$`.)

- [ ] **Step 3: Verify it compiles**

Run: `npx eslint src/pages/SendCrypto.jsx --quiet`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(usd): standardise SendCrypto cap warnings on approxUsd (≈\$)"
```

---

### Task 4: Correct the false `toUsd` comment in `txLimits.js`

No code change — fix the comment that claims the `1:1` unknown-currency fallback
"never under-counts". It under-counts badly for any coin worth more than \$1.

**Files:**
- Modify: `src/lib/txLimits.js` (header ~lines 19-23; `toUsd` comment ~line 48)

- [ ] **Step 1: Fix the header comment**

Replace this block (currently lines 19-23):

```js
//   - Each amount is converted to USD with the SAME static USD_RATES table the
//     Send/Security screens use (caps are denominated in USD). Records whose
//     currency has no rate fall back to 1:1 — the conservative choice (never
//     UNDER-counts spend, so the cap can't be silently bypassed by an unpriced
//     asset).
```

with:

```js
//   - Each amount is converted to USD with the SAME static USD_RATES table the
//     Send/Security screens use (caps are denominated in USD). These are static
//     reference prices, so every converted figure is APPROXIMATE — the UI marks
//     such values with approxUsd() / USD_REFERENCE_NOTE. Records whose currency
//     has no rate fall back to 1:1, an arbitrary placeholder that is approximate
//     in EITHER direction (it under-counts any coin worth >$1); it never fires
//     for the 10 priced coins, so enforcement is unaffected in practice.
```

- [ ] **Step 2: Fix the inline `toUsd` comment**

Replace (currently line 48):

```js
  // Unknown currency → 1:1. Conservative: never under-count spend (see header).
```

with:

```js
  // Unknown currency → 1:1 placeholder (approximate; never fires for priced coins — see header).
```

- [ ] **Step 3: Verify nothing broke**

Run: `npx vitest run src/lib/__tests__/txLimits.test.js`
Expected: PASS, same count as before (comment-only change — proves no logic drift).

- [ ] **Step 4: Commit**

```bash
git add src/lib/txLimits.js
git commit -m "docs(txlimits): correct the 1:1 fallback comment (it is approximate, not conservative)"
```

---

### Task 5: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Lint the whole project**

Run: `npm run lint`
Expected: exit 0 (only pre-existing warnings, if any).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: exit 0, `dist/` produced.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS — the previous green count (432) **plus** the 5 new `approxUsd`
tests = 437, 0 failures. The `txLimits` suite count is unchanged from baseline.

- [ ] **Step 4: Confirm enforcement logic untouched**

Run: `git diff main...HEAD -- src/lib/txLimits.js`
Expected: only comment lines differ — no change to any function body
(`startOfLocalDay`, `isToday`, `toUsd` body, `sumSentTodayUSD`,
`evaluateSendAgainstLimits`).

---

## Notes for the implementer

- Tasks 2 and 3 are JSX presentation edits with no dedicated unit test (the repo
  has no component-render tests for these pages); they are verified by `eslint`
  per-task and by `npm run build` + the full suite in Task 5. This is intentional
  per the spec — the only new unit test is for `approxUsd` (Task 1).
- Line numbers are as of branch `feat/txlimits-honest-approx` (stacked on PR
  #111). If a line has shifted, match on the quoted text, not the number.
- Do **not** touch `evaluateSendAgainstLimits`, the `limitAck` override, or the
  stored cap fields — out of scope per the spec.
