// KDF-migration nudge marker keys — the two localStorage key NAMES shared by
// the R0/R1 keystore guard that writes them and the R2 UI card that reads them.
//
// WHY THIS FILE EXISTS (ring boundary, not tidiness):
// `keystore/kdfMigrationGuard.js` sits inside `wallet-core/keystore`, which the
// ring-import lint treats as R0/R1 crypto-core — the secret-bearing slice. A UI
// component importing anything from there is a ring-boundary violation
// (eslint/rules/ring-import-lint.js), because it puts a UI/XSS surface one hop
// from the KEK and vault modules that live alongside it.
//
// These two exports carry NO secret material — they are the literal names of
// two localStorage markers. Hoisting them to `wallet-core/` (deliberately NOT
// under `keystore/`) is the pattern the rule itself names: "wallet-core/ is NOT
// R0/R1 wholesale. It also holds non-secret metadata that the UI legitimately
// imports (assets.js, netUrl.js, rpcConfig.js)". So the card can read the key
// names without reaching into the crypto-core tree, and there is still exactly
// one definition of each string.
//
// Both keys are swept by the panic wipe — see wallet-core/panic.js
// METADATA_RESIDUE_KEYS. Their PRESENCE is a tell that a real install existed
// and walked the KDF-migration path, so if you add another marker here, add it
// to that list in the same change.

/** Marker read by components/onboarding/KdfMigrationSharesNudge.jsx to decide
 * whether to render the "regenerate your shares" card. Written by
 * `deferKdfMigrationForShares` when the migration is skipped. */
export const NUDGE_PENDING_KEY = 'veyrnox-kdf-migration-pending-shares-warning';

/** Marker written by the nudge card when the user taps "Not now" — the card
 * stays dismissed until a panic-wipe clears the marker. */
export const NUDGE_DISMISSED_KEY = 'veyrnox-kdf-nudge-dismissed';
