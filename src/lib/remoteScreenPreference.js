// @ts-nocheck

export const REMOTE_SCREEN_STORAGE_KEY = 'veyrnox-remote-screen';

export function readRemoteScreenPreference(tipConfigured = false) {
  try {
    const stored = localStorage.getItem(REMOTE_SCREEN_STORAGE_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    // fall through to the configured default
  }
  return tipConfigured;
}

export function persistRemoteScreenPreference(enabled) {
  try {
    localStorage.setItem(REMOTE_SCREEN_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // best-effort only
  }
}
