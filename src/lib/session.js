// lib/session.js — auto-lock timeout preference (session lifetime, NOT crypto).
//
// SCOPE: this module ONLY reads/writes a single user preference — how long the
// wallet may sit idle before WalletProvider.lock() clears the in-memory secret.
// It NEVER touches the vault, the keystore, or any key material. The actual
// locking is performed by the EXISTING WalletProvider.lock() path; this file is
// just the source of truth for "what idle timeout did the user pick?".
//
// Mirrors the app's existing localStorage-preference convention (see
// lib/biometric.js `veyrnox-biometric-unlock`, api/demoClient.js `veyrnox-demo`).
// The default (5 min) is stored as ABSENCE of the key, so a fresh device behaves
// like today's hard-coded 5-minute auto-lock without needing a write.

export const AUTO_LOCK_PREF_KEY = 'veyrnox-autolock-timeout';

// Single source of truth for the picker UI and the timer. `ms: null` = never.
export const AUTO_LOCK_OPTIONS = [
  { value: '1', label: '1 min', ms: 1 * 60 * 1000 },
  { value: '5', label: '5 min', ms: 5 * 60 * 1000 },
  { value: '15', label: '15 min', ms: 15 * 60 * 1000 },
  { value: 'never', label: 'Never', ms: null },
];

export const DEFAULT_AUTO_LOCK_VALUE = '5';

const optionFor = (value) =>
  AUTO_LOCK_OPTIONS.find((o) => o.value === value) ||
  AUTO_LOCK_OPTIONS.find((o) => o.value === DEFAULT_AUTO_LOCK_VALUE);

/** @returns {number|null} idle timeout in ms for a stored value (null = never). */
export function autoLockMsFromValue(value) {
  return optionFor(value).ms;
}

/** @returns {string} the persisted timeout value, or the default if unset/invalid. */
export function loadAutoLockValue() {
  try {
    const v = localStorage.getItem(AUTO_LOCK_PREF_KEY);
    if (v && AUTO_LOCK_OPTIONS.some((o) => o.value === v)) return v;
  } catch {
    /* storage unavailable — fall through to default. */
  }
  return DEFAULT_AUTO_LOCK_VALUE;
}

/** Persist the timeout preference. The default is stored as absence of the key. */
export function saveAutoLockValue(value) {
  try {
    if (value === DEFAULT_AUTO_LOCK_VALUE || !AUTO_LOCK_OPTIONS.some((o) => o.value === value)) {
      localStorage.removeItem(AUTO_LOCK_PREF_KEY);
    } else {
      localStorage.setItem(AUTO_LOCK_PREF_KEY, value);
    }
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

/** Convenience: resolved idle timeout in ms for the current preference. */
export function loadAutoLockMs() {
  return autoLockMsFromValue(loadAutoLockValue());
}
