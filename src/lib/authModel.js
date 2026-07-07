// lib/authModel.js
//
// NON-SECRET per-device auth cohort marker. 'pin' selects the v1 8-digit PIN
// entry surface + Option A deterministic-decoy resolution; 'password' is the
// legacy free-text vault-password surface (unchanged). Written once at PIN-wallet
// creation. This is NOT a secret and NOT a deniability tell: within the PIN cohort
// it is universal (every PIN device is the same single-mode machine), and the
// entry surfaces are visibly different anyway, so the cohort is already observable.

const KEY = 'veyrnox-auth-model';

/**
 * Read the persisted cohort marker for this device.
 * @returns {'pin'|'password'}
 */
export function getAuthModel() {
  try { return localStorage.getItem(KEY) === 'pin' ? 'pin' : 'password'; }
  catch { return 'password'; }
}

export function setAuthModel(model) {
  if (model !== 'pin' && model !== 'password') {
    throw new Error(`Unknown auth model: ${model}`);
  }
  try { localStorage.setItem(KEY, model); }
  catch { /* best-effort; defaults to password on read */ }
}

export function isPinModel() { return getAuthModel() === 'pin'; }

/** Clear the persisted cohort marker (used by fail-closed onboarding teardown). */
export function clearAuthModel() {
  try { localStorage.removeItem(KEY); } catch { /* best-effort */ }
}

/**
 * Whether changePassword may re-cache the NEW secret behind the biometric gate.
 * REVIEW ITEM 3: in the PIN cohort the biometric cache holds the DURESS PIN, and
 * the secret changePassword changes is the REAL PIN — re-caching it would make
 * Face ID open the real set (the coercion bypass §2/§11 forbid). So the PIN cohort
 * NEVER re-caches. Pure for testability.
 * @param {{authModel: 'pin'|'password', biometricEnabled: boolean}} ctx
 * @returns {boolean}
 */
export function shouldCacheUnlockSecret({ authModel, biometricEnabled }) {
  return biometricEnabled && authModel !== 'pin';
}

/**
 * Whether the returning-user PIN-unlock screen may AUTO-CACHE the PIN the user just
 * typed behind the biometric gate.
 *
 * COERCION-RESISTANCE GUARD (I3/I4). The `alreadyCached` check is the operative guard:
 * if the user opted into Face-ID-opens-the-decoy (enableDecoyBiometricUnlock), the cache
 * already holds the DURESS PIN. `alreadyCached: true` prevents the auto-cache from
 * overwriting that decoy secret with the real PIN.
 *
 * History: this function previously checked `duressConfigured` via `hasDuressVault()`.
 * That was broken since the PIN-cohort chaff-provisioning design: every PIN device
 * provisions a chaff blob into the `secondary` (duress) IndexedDB slot at onboarding
 * (provisionChaff.js) so that all devices are structurally identical — meaning
 * `hasDuressVault()` ALWAYS returns true and the auto-cache NEVER fired. The
 * `alreadyCached` guard is sufficient: chaff never writes a biometric cache, so
 * `alreadyCached` is false on a fresh device (auto-cache fires correctly); once the
 * user opts into Face-ID→decoy, `alreadyCached` is true (auto-cache blocked correctly).
 *
 * @param {{biometricEnabled: boolean, alreadyCached: boolean}} ctx
 * @returns {boolean}
 */
export function shouldAutoCacheTypedPin({ biometricEnabled, alreadyCached }) {
  if (!biometricEnabled) return false;
  if (alreadyCached) return false;
  return true;
}
