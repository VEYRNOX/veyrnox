// src/lib/entryGate.js
//
// The pure decision behind the on-device auth front door (components/WalletEntry.jsx).
// WalletEntry renders ONE of several top-level screens; which one is a function of
// four pieces of state, with no side effects. Extracting that choice here makes it
// unit-testable so the ONBOARDING INVARIANT can't silently regress:
//
//   The "Unlock your wallet / Vault Password" screen appears ONLY when an
//   encrypted vault actually exists on this device.
//
// A first-time user (no vault) must never hit the unlock wall — they browse the
// real app view-only (explore) or see the first-run create/import choice. A
// returning user (vault exists) gets the unlock screen; once unlocked, the app.
//
// No crypto, no storage, no React here — just the gate rule. WalletEntry owns the
// state (isUnlocked from WalletProvider, vaultExists from keyStore.hasVault(),
// exploreMode from WalletProvider, generatedSeed = a seed held for one-time backup).

/**
 * Decide the top-level screen WalletEntry should render.
 *
 * @param {object} s
 * @param {boolean} s.isUnlocked   - vault is unlocked this session
 * @param {boolean|null} s.vaultExists - true/false once probed; null while probing
 * @param {boolean} s.exploreMode  - user is browsing view-only with no vault
 * @param {string} s.generatedSeed - non-empty only during the one-time create backup hold
 * @returns {'app'|'explore'|'loading'|'form'}
 */
export function resolveEntryScreen({ isUnlocked, vaultExists, exploreMode, generatedSeed }) {
  // Unlocked → reveal the app, UNLESS we're holding on the one-time seed-backup
  // screen right after create (vault is unlocked but the seed must be confirmed).
  if (isUnlocked && !generatedSeed) return 'app';

  // No vault on this device and the user is browsing view-only → the explore
  // dashboard (the real app behind a persistent create/import CTA). Strictly the
  // no-vault state: a present vault can never reach here.
  if (vaultExists === false && exploreMode && !generatedSeed) return 'explore';

  // Probe still in flight (only relevant while locked).
  if (vaultExists === null) return 'loading';

  // Everything else is a form: the unlock screen (vault exists) or the first-run
  // create/import/choose flow (no vault). The sub-view is chosen by initialEntryView.
  return 'form';
}

/**
 * The first form sub-view once the vault probe resolves: a returning user (vault
 * exists) starts on the unlock screen; a first-time user starts on the create/
 * import choice. ("Forgot password?" later switches unlock → import for recovery.)
 *
 * @param {boolean} vaultExists
 * @returns {'unlock'|'choose'}
 */
export function initialEntryView(vaultExists) {
  return vaultExists ? 'unlock' : 'choose';
}
