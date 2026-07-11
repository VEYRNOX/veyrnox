# Veyrnox UI / UX / Accessibility — QA Findings

Scope: Task 5 UI/UX/a11y audit. Tested via Playwright (Chromium) against
`http://localhost:5173` in demo mode (`?demo=1`). Tier 1 routes tested at
1440×900 (light + dark), 375×812 (mobile), and 768×1024 (tablet). axe-core
(`@axe-core/playwright`, WCAG 2.2 AA tags) run on all Tier 1 routes at
1440×900. Tier 2 routes were not reached (time-boxed to Tier 1 per plan).

Theme toggling: app uses `next-themes` with `attribute="class"` and
`storageKey="veyrnox-theme"`, `defaultTheme="dark"`. Light mode was reached
by pre-seeding `localStorage.veyrnox-theme = "light"` before load (the
`prefers-color-scheme` media query alone does **not** switch theme, since
the toggle is app-controlled, not OS-controlled — noted for anyone re-running
this audit).

## Route Audit — Light Mode (1440px)

| Route | Renders | No Errors | Heading | CTA | Fonts | No Overflow |
|---|---|---|---|---|---|---|
| `/` | ✅ | ✅ | ⚠️ no `h1`/`h2` (see A11Y-01) | ✅ Send/Receive/Schedule/Add | ✅ | ✅ |
| `/send` | ⚠️ redirects to `/` on cold load (see UX-01) | ✅ | n/a (redirected) | n/a | ✅ | ✅ |
| `/receive` | ✅ | ✅ | ✅ "Receive Crypto" | ✅ | ✅ | ✅ |
| `/tx-history` | ✅ | ✅ | ✅ "Transaction History" | ✅ | ✅ | ✅ |
| `/receipt` | ✅ | ✅ | ✅ "Transaction Receipts" | ✅ | ✅ | ✅ |
| `/security` | ✅ | ✅ | ✅ "Security Center" | ✅ | ✅ | ✅ |
| `/security-dashboard` | ✅ | ✅ | ✅ "Security Dashboard" | ✅ | ✅ | ✅ |
| `/settings` | ✅ | ✅ | ✅ "Security Settings" | ✅ | ✅ | ✅ |
| `/landing` | ✅ | ✅ | ✅ "Your keys, on your device" | ✅ "Launch App" | ✅ | ✅ |

"No Errors" filters the CSP `frame-ancestors`-via-`<meta>` browser notice
(expected/benign — CSP frame-ancestors cannot be delivered via meta tag by
spec; this is informational, not a functional error) and Vite dev-only
"Module externalized for browser compatibility" (`buffer`/`fs`) warnings.

## Route Audit — Dark Mode (1440px)

> **Contrast column caveat:** ✅ marks in the Contrast column are **visual spot-checks, not measured WCAG ratios**. The axe-core run (see Accessibility Violations below) did not surface `color-contrast` violations on these routes, but per-element luminance ratios were not independently computed. Treat as "no obvious contrast failure observed," not "measured AA-compliant."

| Route | Dark BG | Contrast | Icons | Inputs | Fonts | No Bleed |
|---|---|---|---|---|---|---|
| `/` | ✅ `rgb(5,7,10)` | ✅ | ✅ | n/a | ✅ | ✅ |
| `/send` | ✅ (redirects to `/`, see UX-01) | ✅ | ✅ | n/a | ✅ | ✅ |
| `/receive` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/tx-history` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/receipt` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/security` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/security-dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/settings` | ✅ | ✅ | ✅ | ✅ toggle switches now have visible + programmatic labels (fixed) | ✅ | ✅ |
| `/landing` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |

Visual spot-check confirmed: single teal accent (`#4ADAC2`-family) used
consistently for success/verified states across dashboard, security
dashboard, and landing; no stray accent colors observed; near-black surface
tokens (`#050608`–`#1D222B` range) hold in both light nav rail (white/gray
`#F8FAFB`) and dark background — no unstyled white flashes seen in any
screenshot.

## Responsive Audit

| Route | 375 overflow | 375 nav | 375 CTA | 768 overflow |
|---|---|---|---|---|
| `/` | ✅ none | ✅ bottom tab bar (Home/Send/Receive/More) | ✅ Send/Receive above the fold | ✅ none |
| `/send` | ✅ none | ✅ | n/a (redirect, UX-01) | ✅ none |
| `/receive` | ✅ none | ✅ | ✅ | ✅ none |
| `/tx-history` | ✅ none | ✅ | ✅ | ✅ none |
| `/receipt` | ✅ none | ✅ | ✅ | ✅ none |
| `/security` | ✅ none | ✅ | ✅ | ✅ none |
| `/security-dashboard` | ✅ none | ✅ | ✅ | ✅ none |
| `/settings` | ✅ none | ✅ | ✅ | ✅ none |
| `/landing` | ✅ none | ✅ (top nav collapses) | ✅ "Launch App" | ✅ none |

`document.documentElement.scrollWidth` vs `clientWidth` measured
programmatically at both breakpoints for all 9 routes — no horizontal
overflow detected anywhere.

## Font Audit

- Declared fonts: `Schibsted Grotesk` (weights 400–900, variable, self-hosted
  woff2, `latin` + `latin-ext` subsets) for prose/sans; `IBM Plex Mono`
  (weights 400/500/600, self-hosted woff2) for verifiable values — matches
  design system (`src/index.css`, `tailwind.config.js`).
- 404s: none observed. All `.woff2` network responses returned 2xx across
  all 9×4 (route × breakpoint/theme) page loads captured by the audit
  script's response listener.
- Missing weights: none — Tailwind `fontFamily.sans`/`fontFamily.mono` map
  to the two self-hosted families; fallback stacks (`ui-sans-serif,
  system-ui, -apple-system, Segoe UI, Roboto, sans-serif` /
  `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) are sane and
  match declared weights.
- FOUT: not directly measurable from static screenshots, but all
  `@font-face` rules use `font-display: swap` with local woff2 sources (no
  CDN round-trip), so fallback text should paint immediately and swap in
  place — no visible tofu/invisible text in any captured screenshot.
- Fallback stack: `sans: '"Schibsted Grotesk", ui-sans-serif, system-ui,
  -apple-system, Segoe UI, Roboto, sans-serif'`; `mono: '"IBM Plex Mono",
  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'`.

## Accessibility Violations (axe-core WCAG 2.2 AA)

| Route | Rule | Impact | Nodes | Description |
|---|---|---|---|---|
| `/` | meta-viewport | moderate | 1 | `<meta name="viewport">` disables text scaling/zoom (`maximum-scale=1.0, user-scalable=no`) |
| `/send` | meta-viewport | moderate | 1 | same (page redirects to `/`, so this reflects the Dashboard it lands on) |
| `/receive` | meta-viewport | moderate | 1 | same |
| `/tx-history` | meta-viewport | moderate | 1 | same |
| `/receipt` | meta-viewport | moderate | 1 | same |
| `/receipt` | scrollable-region-focusable | serious | 1 | scrollable tx-list `<div>` not keyboard-focusable — **fixed inline** |
| `/security` | meta-viewport | moderate | 1 | same |
| `/security-dashboard` | meta-viewport | moderate | 1 | same |
| `/settings` | button-name | critical | 2 | Radix `Switch` (role="switch") toggles (Dark Mode, Activity log) had no accessible name — **fixed inline** |
| `/settings` | meta-viewport | moderate | 1 | same |
| `/landing` | meta-viewport | moderate | 1 | same |

`meta-viewport` fires on every route because it is a single, global
`<meta>` tag in `index.html` (`user-scalable=no, maximum-scale=1.0`), not a
per-route regression.

## Findings Table

> **axe impact → project severity mapping:** axe's `critical`/`serious`/`moderate` impact is remapped to this plan's CRITICAL/HIGH/MEDIUM/LOW by *user-facing consequence*, not 1:1. A `critical`-impact axe rule affecting a single non-blocking control (e.g. `button-name` on a settings toggle) is HIGH here, not CRITICAL, because it does not block a core wallet flow. CRITICAL is reserved for blank-render or total-lockout defects.

| ID | Severity | Description | Route/File | Fixed inline? |
|---|---|---|---|---|
| A11Y-01 | HIGH | `Switch` toggles ("Dark Mode", "Activity log") on `/settings` had no discernible accessible name (axe `button-name`, impact critical) — screen-reader users could not tell what the toggle controls or its state label. | `src/pages/Settings.jsx` | ✅ Yes — added `aria-label` describing the action/current-state to both `Switch` elements. No `onCheckedChange`/logic/values touched. |
| A11Y-02 | MEDIUM | Scrollable transaction list (`max-h-[480px] overflow-y-auto`) on `/receipt` was not keyboard-focusable, so keyboard-only users could not scroll it (axe `scrollable-region-focusable`, impact serious). | `src/pages/TransactionReceipt.jsx` | ✅ Yes — added `tabIndex={0}` to the scroll container. Purely presentational; no data/filter logic touched. |
| A11Y-03 | MEDIUM | Global `<meta name="viewport">` sets `maximum-scale=1.0, user-scalable=no`, disabling pinch-zoom/text-resize site-wide (axe `meta-viewport`, WCAG 1.4.4/1.4.10). Affects all routes. | `index.html` | ❌ No — this is a single global tag shared by the web app **and** the Capacitor iOS/Android shells (`android/`, `ios/` present in repo); removing `user-scalable=no` is a cross-surface behavioral change I can't fully verify (native WebView zoom/gesture behavior, PWA app-shell feel) within this audit. Flagging for a dedicated, verifiable fix rather than a blind edit. |
| UX-01 | MEDIUM | Direct/cold navigation to `/send?demo=1` (full page load, not client-side `<Link>` nav) silently redirects to `/` before the Send form ever renders — confirmed via `page.url()` after `networkidle` returning `http://localhost:5173/` instead of `/send`. Same likely applies to other deep-linkable protected routes. Not reproducible by clicking "Send" from the dashboard nav (client-side transition works fine, screenshots elsewhere in this repo's manual testing show `/send` rendering correctly post-navigation). | `src/pages/SendCrypto.jsx` (or a routing/vault-lock guard it relies on) | ❌ No — this smells like vault/session-lock gating logic (redirect-when-locked-or-uninitialized on cold load), which is explicitly out of scope to touch. Flagging for the app team to confirm intentional vs. bug; if intentional, consider a plain-language "redirecting to unlock" message instead of a silent bounce, since a silent redirect away from a bookmarked/shared deep link reads as a bug to users. |
| A11Y-04 | LOW | `/` (Dashboard) has no `<h1>`/`<h2>` element — page title is only conveyed visually ("Portfolio Value" label) with no semantic heading landmark for screen-reader users to jump to. axe did not flag this directly (no `page-has-heading-one` rule in the WCAG22AA tag set used), but it fails the "primary heading visible" audit dimension in this plan and is a real screen-reader navigation gap. | `src/pages/Dashboard.jsx` | ❌ No — Dashboard.jsx interleaves display-only balance markup with the same component tree used for lock/unlock state and wallet-derived values; adding a heading is safe in isolation, but I could not fully rule out a downstream reflow/CSS regression risk in the remaining audit time. Left for a follow-up cosmetic-only pass with more headroom to verify against every dashboard widget state (locked/unlocked/empty). |

## Summary

- Total findings: 5
- CRITICAL: 0 | HIGH: 1 | MEDIUM: 3 | LOW: 1
- Fixed inline: 2 (A11Y-01, A11Y-02)

## Verification evidence

- `npx eslint src/pages/Settings.jsx src/pages/TransactionReceipt.jsx` → 0
  errors, 2 pre-existing warnings unrelated to these edits (`no-empty` in
  `Settings.jsx` line 47, `react/no-unescaped-entities` in
  `TransactionReceipt.jsx` line 102 — both pre-date this change).
- Re-ran axe-core against `/settings` and `/receipt` after the fixes:
  `button-name` and `scrollable-region-focusable` violations no longer
  present on either route.
- Screenshot verification: `/settings` re-screenshotted post-fix — both
  Dark Mode and Activity log switches render identically (visual
  no-op), teal accent intact, dark surface tokens intact.
- No seed/key/signing/auth logic was touched. `SendCrypto.jsx` was read
  only (for the UX-01 investigation) — no edits made to it.
