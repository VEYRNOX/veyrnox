// lib/authModel.js
//
// NON-SECRET per-device auth cohort marker. 'pin' selects the v1 6-digit PIN
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
