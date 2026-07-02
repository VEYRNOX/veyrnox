// lib/copySecret.js — write a secret to the OS clipboard and schedule a
// best-effort wipe after 30 s. The wipe reduces the window in which a
// background app or clipboard history feature can read the phrase.
//
// This module now delegates to lib/secureClipboard.js (Brief A, Lane 2), which
// owns the wipe scheduling, the app-lock/hidden early-wipe triggers, the
// fail-honest signal, and the H-NEW-3 non-empty replacement. copySecret keeps its
// original fire-and-forget signature so existing call sites and tests stay green.
import { copySensitive, WIPE_REPLACEMENT } from './secureClipboard';

const WIPE_MS = 30_000;

// Re-exported so existing importers keep working after the refactor.
export { WIPE_REPLACEMENT };
export { WIPE_MS };

// Plain clipboard write without a wipe timer — for public values (addresses,
// signatures) that the user may still need on the clipboard after copy.
export function copyPlain(text) {
  navigator?.clipboard?.writeText(text).catch(() => {});
}

// Copy a secret and schedule the best-effort wipe. Returns undefined (unchanged
// fire-and-forget contract); delegates the wipe lifecycle to copySensitive.
export async function copySecret(text) {
  await copySensitive(text, { ttlMs: WIPE_MS });
}
