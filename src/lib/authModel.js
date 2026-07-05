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
 * COERCION-RESISTANCE GUARD (I3/I4). Design intent: with NO duress PIN configured,
 * Face ID unlocks the REAL wallet, so caching the typed (real) PIN on first biometric
 * unlock is correct (the sanctioned primary flow removeDuressPin's re-enable path
 * documents). But once a DURESS PIN exists, Face ID must open the DECOY only — and
 * that decoy cache is written EXPLICITLY via the Duress screen opt-in
 * (enableDecoyBiometricUnlock). If the returning screen also auto-cached the typed PIN,
 * a user who unlocks with their REAL PIN before/without the opt-in would silently make
 * Face ID open the REAL wallet (on a KEK vault the real PIN's C unwraps the DEK), which
 * defeats the whole Face-ID-to-decoy design. So we auto-cache ONLY when NO duress vault
 * is configured. We also never re-cache when a secret is already present (never clobber
 * a deliberately-set decoy cache), and never cache when biometric unlock is off.
 *
 * Pure for testability; the async duress-presence read is done by the caller and passed
 * in as `duressConfigured`. CALLER CONTRACT (fail closed): if duress presence cannot be
 * determined, pass duressConfigured: true — skipping the convenience cache is safe;
 * caching a real PIN next to an unknown duress state is not.
 *
 * @param {{biometricEnabled: boolean, alreadyCached: boolean, duressConfigured: boolean}} ctx
 * @returns {boolean}
 */
export function shouldAutoCacheTypedPin({ biometricEnabled, alreadyCached, duressConfigured }) {
  if (!biometricEnabled) return false;
  if (alreadyCached) return false;
  if (duressConfigured) return false;
  return true;
}
