// lib/onboardingEntry.js
//
// The on-device auth front door's LANDING decision, extracted as a pure function
// so the PIN-FIRST onboarding order is unit-testable and cannot silently regress.
//
// AUTHORITATIVE ORDER (onboarding brief): a fresh device routes to PIN-create
// BEFORE any dashboard. The empty (explore) dashboard is reached ONLY AFTER the
// PIN is set in Phase 1 (driven by the provider's setupPin entering explore) —
// it is NOT the fresh-open landing. This has been mis-built as "explore-first"
// (dashboard, then PIN) before; this helper + its test pin the invariant down.
//
// Returns the WalletEntry `view` to land on:
//   'unlock'      — a vault exists on this device → returning-user unlock surface
//                   (PIN pad for the PIN cohort, password for the legacy cohort).
//   'entry-tiles' — fresh device (no vault) → the 3-tile entry picker (New / Have /
//                   Advanced, Slice D1: docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md),
//                   which sits AHEAD of PIN-create. New/Have both advance to
//                   PIN-create (Phase 1); Advanced goes straight to the .enc
//                   restore-file flow. It is a pure branding/picker screen — it
//                   holds no wallet, no balances, no dashboard — so the PIN-first
//                   order is intact. WelcomeHero (the single "Get Started" screen
//                   this replaced as the default landing) is preserved in code and
//                   still reachable via the 'welcome' view state, but no live path
//                   sets that view any more.
//
// HARD INVARIANT: with NO vault the answer is NEVER an explore/dashboard/wallet
// view ('choose' / 'explore'). It is 'entry-tiles' (which only leads onward to
// 'pin-create' or 'restore-file'); a PIN is still required before any wallet
// exists (Advanced's backup file carries its own credential instead). The
// post-PIN empty dashboard remains a separate, in-session state (exploreMode +
// pendingPin), never produced here from a cold mount.
//
// @param {{ hasVault: boolean }} state  whether a vault exists on this device
// @returns {'unlock' | 'entry-tiles'}
export function resolveOnboardingEntry({ hasVault }) {
  return hasVault ? 'unlock' : 'entry-tiles';
}
