// lib/seedImportRoute.js
//
// The seed-import ROUTING decision at the auth front door, extracted as a pure
// function so #140's invariant is unit-pinned and cannot silently regress.
//
// THE LEAK THIS GUARDS (v1-auth-surface-brief §0/§5). Entering an existing seed
// must provision the PIN cohort — the SAME kind of device a fresh PIN onboarding
// produces — so an imported-from-scratch device is indistinguishable from a
// created one. The shipped path routed first-run import through the legacy
// password import (`view:'import'` → setAuthModel('password')), an observable
// "this wallet was imported, not created" tell. #140 reuses the seed→PIN flow
// (the same one forgot-PIN recovery uses) so import lands in the PIN cohort.
//
// Both seed-entry points share this route:
//   • recovering=false — first-run "Import an existing seed" (from the choose view)
//   • recovering=true  — forgot-PIN recovery (from the unlock view)
// Only the Back target differs (handled by the caller); the provisioning is
// identical (provisionPinRecovery → PIN cohort).
//
// Returns the WalletEntry routing descriptor:
//   view:       'pin-recover'   — the shared seed→PIN provisioning view
//   recovering: <flag>          — first-run import (false) vs forgot-PIN (true)
//   pinStep:    'seed'          — start at seed entry
//
// HARD INVARIANT: view is ALWAYS 'pin-recover', NEVER 'import'. A seed import can
// never select the legacy password cohort — that is the precise §0/§5 tell #140
// closes.
//
// @param {{ recovering?: boolean }} [opts]
// @returns {{ view: 'pin-recover', recovering: boolean, pinStep: 'seed' }}
export function seedImportRoute({ recovering = false } = {}) {
  return { view: 'pin-recover', recovering: !!recovering, pinStep: 'seed' };
}
