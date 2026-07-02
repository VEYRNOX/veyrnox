// lib/secureClipboard.js — write a sensitive value (seed phrase, private key) to
// the OS clipboard and schedule a best-effort wipe. The wipe shrinks the window
// in which a background app or clipboard-history feature can read the secret.
//
// Closes three gaps vs the LLD spec (Brief A, Lane 2):
//   (a) App-lock wipe: locking the wallet while the page stays visible used to
//       leave the secret on the clipboard until TTL. We now wipe on APP_LOCK_EVENT.
//   (b) Fail honest (I4): if navigator.clipboard.writeText is absent we do NOT
//       fake success — copySensitive returns { copied:false, cleared:null } so the
//       caller can surface a notice ("this device can't auto-clear…") rather than
//       showing a success check for a wipe that will never run.
//   (c) A { cleared } promise so the UI can reflect wipe state.
//
// H-NEW-3 hardening (preserved, stronger than the brief):
//  - The wipe writes a NON-EMPTY replacement, not ''. Some clipboard managers
//    (Samsung, Gboard) treat an empty write as a new history entry, leaving the
//    secret in history; overwriting with real content replaces it instead.
//  - Every wipe write is wrapped in .catch() — writeText requires document focus
//    in many browsers, so a backgrounded/blurred page rejects; swallow quietly.

// The event a caller (WalletProvider.lock) dispatches on window to force an
// immediate clipboard wipe the moment the wallet locks.
export const APP_LOCK_EVENT = 'veyrnox:app-lock';

const DEFAULT_TTL_MS = 30_000;

// The clipboard is overwritten with this string on wipe. This is an unconditional
// best-effort overwrite — we do not read back the clipboard before wiping, so if
// the user copied something else afterward it will also be overwritten. It is a
// replacement string, not a read-back sentinel.
export const WIPE_REPLACEMENT = '•'.repeat(24); // non-empty replacement defeats clipboard-history dedup

// Whether this device can auto-clear the clipboard. Callers render the fail-honest
// notice BEFORE copying when this is false — a notice, not a block.
export function canAutoClear() {
  return { available: !!navigator?.clipboard?.writeText };
}

/**
 * Copy a sensitive value and schedule a best-effort wipe.
 *
 * @param {string} text
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<{ copied: boolean, cleared: Promise<void>|null }>}
 *   - clipboard API absent  → { copied:false, cleared:null } (fail honest, no fake
 *     success; the caller shows a notice and the user may still proceed manually).
 *   - otherwise             → { copied:true, cleared } where `cleared` resolves once
 *     the wipe has run, from whichever trigger fires first (TTL, app-lock, hidden).
 *     The wipe runs AT MOST ONCE; all timers/listeners are cleaned up after it.
 */
export async function copySensitive(text, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!navigator?.clipboard?.writeText) {
    // Fail honest (I4): do not schedule anything, do not pretend it worked.
    return { copied: false, cleared: null };
  }

  await navigator.clipboard.writeText(text);

  let resolveCleared;
  const cleared = new Promise((resolve) => { resolveCleared = resolve; });

  let done = false;
  let timer = null;

  const cleanup = () => {
    if (timer != null) { clearTimeout(timer); timer = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onHide);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener(APP_LOCK_EVENT, onLock);
    }
  };

  // Run the wipe at most once; tear down every listener/timer afterward so nothing
  // leaks and no second wipe can fire.
  const wipe = () => {
    if (done) return;
    done = true;
    cleanup();
    // Focus may be lost (page hidden / blurred) — best effort, swallow rejection.
    const write = navigator?.clipboard?.writeText(WIPE_REPLACEMENT).catch(() => {});
    Promise.resolve(write).finally(() => resolveCleared());
  };

  function onHide() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      wipe();
    }
  }

  function onLock() {
    wipe();
  }

  timer = setTimeout(wipe, ttlMs);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
  }
  if (typeof window !== 'undefined') {
    // One-shot: onLock wipes then cleanup() removes this listener.
    window.addEventListener(APP_LOCK_EVENT, onLock);
  }

  return { copied: true, cleared };
}
