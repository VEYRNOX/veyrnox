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
//   'unlock'     — a vault exists on this device → returning-user unlock surface
//                  (PIN pad for the PIN cohort, password for the legacy cohort).
//   'pin-create' — fresh device (no vault) → PIN-create (Phase 1) FIRST.
//
// HARD INVARIANT: with NO vault the answer is ALWAYS 'pin-create', NEVER an
// explore/dashboard view. The post-PIN empty dashboard is a separate, in-session
// state (exploreMode + pendingPin), never produced here from a cold mount.
//
// @param {{ hasVault: boolean }} state  whether a vault exists on this device
// @returns {'unlock' | 'pin-create'}
export function resolveOnboardingEntry({ hasVault }) {
  return hasVault ? 'unlock' : 'pin-create';
}
