// lib/duressBiometricGuard.js — the duress ⇄ biometric-cache invariant.
//
// THE INVARIANT (H-3): while a duress PIN is DELIBERATELY configured, one-tap
// biometric unlock must never release the REAL PIN. Face ID may open the DECOY, or
// nothing at all — never the real wallet. Otherwise the duress feature inverts its own
// promise: a coercer says "just use Face ID" and gets the real funds.
//
// WHY THIS MODULE EXISTS (P1-A). WalletProvider.setDuressPin force-clears the cache
// when a duress PIN is configured, but that only ever runs inside FUTURE setDuressPin
// calls. Every user who configured their Emergency PIN BEFORE that fix shipped still
// has the REAL PIN cached with `veyrnox-biometric-unlock` armed, and nothing at app
// start or lock-screen mount re-checked it — so H-3 stayed live for exactly the
// population that opted into duress protection. enforceDuressBiometricInvariant() is
// that missing re-check, run on cold lock-screen mount.
//
// THE DISCRIMINATOR (and why it is NOT hasDuressVault). The original duress guard in
// shouldAutoCacheTypedPin was deleted in 88c921c7 / PR #714 because it asked
// `hasDuressVault()` — and PIN-cohort chaff provisioning writes a blob into the duress
// slot on EVERY device (provisionChaff.js), so it was permanently true and auto-caching
// never fired at all. `veyrnox-duress-configured` is a different signal: written ONLY
// when the user deliberately SAVES an Emergency PIN, removed when they remove it. It
// distinguishes real configuration from chaff, so re-introducing a guard on it does not
// re-introduce the PR #714 bug (pinned by tests in both suites).
//
// DENIABILITY (hard constraint — no new tell):
//   • Both signals read here are localStorage keys that ALREADY exist on this device
//     (`veyrnox-duress-configured`, written by the Emergency-PIN screen since PR #762;
//     `veyrnox-decoy-biometric`, written by enableDecoyBiometricUnlock). Both are
//     already in panic.js's residue-wipe list. Nothing new is persisted, ever.
//   • A device with no duress PIN configured short-circuits on the first read and
//     performs ZERO writes and ZERO awaits — behaviour is byte-identical to before.
//   • The disarmed end state ("pref off, no cached secret") is exactly the state of a
//     device that simply never turned Face ID on. It removes an ambiguity; it does not
//     create one. The lock screen renders its ordinary PIN-only surface with no message
//     and no distinct error, so nothing on screen differs between a user who was
//     disarmed and one who never enabled biometric unlock.
//   • No network, no timing branch that depends on secret state beyond a localStorage
//     read and (once, at most) a secure-store delete.
//
// HONEST RESIDUAL GAPS:
//   1. `veyrnox-duress-configured` has only been written since PR #762 (6892f820). A
//      user who configured a duress PIN BEFORE that commit and never re-saved it has no
//      marker, so this guard cannot see them. There is no better signal — hasDuressVault()
//      is chaff-saturated by design. Those users remain exposed until they re-save or
//      remove their Emergency PIN.
//   2. A pre-fix user who opted into Face-ID-opens-the-decoy while biometric unlock was
//      ALREADY on has no `veyrnox-decoy-biometric` marker (it was only written when the
//      opt-in itself flipped the pref on). This guard will disarm their legitimately
//      decoy-bound cache. That is the fail-closed direction — they lose one-tap unlock
//      and can re-arm it — not a security failure.
//   3. If the platform secure store refuses the delete, the cached secret remains at
//      rest; JS cannot force its removal. We drop the preference FIRST so one-tap unlock
//      is no longer offered, and report the disarm honestly.

import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometric';
import { clearUnlockSecret } from '@/lib/biometricUnlock';

/**
 * Set to '1' by the Emergency-PIN screen when the user DELIBERATELY saves a duress
 * PIN; removed when they remove it. NOT chaff — see the module header.
 */
export const DURESS_CONFIGURED_KEY = 'veyrnox-duress-configured';

/**
 * Set to '1' by WalletProvider.enableDecoyBiometricUnlock — positive evidence that the
 * biometric unlock cache holds the DURESS pin, not the real one.
 */
export const DECOY_BIOMETRIC_MARKER_KEY = 'veyrnox-decoy-biometric';

/**
 * Did the user deliberately configure a duress PIN?
 * FAILS CLOSED (I4): if the signal cannot be read we assume duress IS configured, so
 * every caller takes the protective branch. (In practice an unreadable localStorage
 * also makes isBiometricUnlockEnabled() false, so this cannot strand a user.)
 * @returns {boolean}
 */
export function isDuressConfigured() {
  try { return localStorage.getItem(DURESS_CONFIGURED_KEY) === '1'; }
  catch { return true; }
}

/**
 * Is there positive evidence that the biometric unlock cache holds the DECOY secret?
 * FAILS CLOSED (I4): "cannot read" means "no proof it is the decoy's" → false → the
 * caller disarms rather than trusting an unverifiable cache.
 * @returns {boolean}
 */
export function isDecoyBiometricCache() {
  try { return localStorage.getItem(DECOY_BIOMETRIC_MARKER_KEY) === '1'; }
  catch { return false; }
}

/**
 * PURE decision: is this device in the H-3 vulnerable state?
 *
 * True ONLY when one-tap unlock is armed, a duress PIN was deliberately configured,
 * and there is no positive evidence the cached secret is the decoy's. Every input must
 * be EXPLICITLY true/false — an absent flag never produces a spurious disarm.
 *
 * @param {{biometricEnabled?: boolean, duressConfigured?: boolean, decoyCacheMarked?: boolean}} ctx
 * @returns {boolean}
 */
export function shouldDisarmBiometricUnlock({ biometricEnabled, duressConfigured, decoyCacheMarked } = {}) {
  if (biometricEnabled !== true) return false;   // nothing armed → nothing to disarm
  if (duressConfigured !== true) return false;   // no duress → the pref is the user's own
  if (decoyCacheMarked === true) return false;   // Face ID opens the DECOY — leave it
  return true;
}

/**
 * Enforce the invariant on the live device. Idempotent (a second call is a no-op,
 * because the first turned the preference off) and safe to call on every lock-screen
 * mount / app start.
 *
 * Never throws: this runs on the entry screen, and a storage hiccup must not strand a
 * user at a blank lock screen. It still fails CLOSED in the way that matters — the
 * preference is dropped BEFORE the secure-store delete, so even if the delete fails the
 * one-tap button is no longer offered.
 *
 * @returns {Promise<boolean>} true if this call disarmed the device.
 */
export async function enforceDuressBiometricInvariant() {
  let armed = false;
  try { armed = isBiometricUnlockEnabled(); } catch { return false; }
  // Cheapest signal first: a device with no duress PIN does zero further work and
  // zero writes — identical behaviour to a build without this guard.
  if (!armed) return false;
  if (!shouldDisarmBiometricUnlock({
    biometricEnabled: true,
    duressConfigured: isDuressConfigured(),
    decoyCacheMarked: isDecoyBiometricCache(),
  })) return false;

  // Preference first (a localStorage write that cannot realistically fail), then the
  // secret. See HONEST RESIDUAL 3 above for the store-refuses-delete case.
  try { setBiometricUnlockEnabled(false); } catch { /* best-effort preference */ }
  try { await clearUnlockSecret(); } catch { /* residual: secret may remain at rest */ }
  return true;
}
