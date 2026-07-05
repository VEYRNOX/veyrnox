// lib/copySecret.js — write a secret to the OS clipboard and schedule a
// best-effort wipe after 30 s. The wipe reduces the window in which a
// background app or clipboard history feature can read the phrase.
//
// H-NEW-3 hardening:
//  - Wipe writes a NON-EMPTY replacement, not ''. Some clipboard managers (Samsung,
//    Gboard) treat an empty write as a new history entry, leaving the secret in
//    history; overwriting with real content replaces it instead.
//  - The wipe write is wrapped in .catch() — writeText requires document focus in
//    many browsers, so a backgrounded/blurred page rejects; we swallow that quietly.
//  - A visibilitychange listener wipes early when the page is hidden (navigation,
//    lock screen, app background), shrinking the exposure window.
//
// Brief A, Lane 2 (re-applied from closed PR #556): locking the wallet while the
// page stays VISIBLE (panic, duress, idle, session ceiling) left the secret on the
// clipboard until the TTL — the visibilitychange trigger never fires in that case.
// WalletProvider.lock() dispatches APP_LOCK_EVENT on window; we wipe immediately.
// The wipe runs AT MOST ONCE across all three triggers and tears every
// listener/timer down afterward.

// The event WalletProvider.lock() dispatches on window to force an immediate
// clipboard wipe the moment the wallet locks.
export const APP_LOCK_EVENT = 'veyrnox:app-lock';

const WIPE_MS = 30_000;
// The clipboard is overwritten with this string on wipe. Note: this is an
// unconditional best-effort overwrite — we do not read back the clipboard before
// wiping, so if the user copied something else afterward, it will also be
// overwritten. It is a replacement string, not a read-back sentinel.
const WIPE_REPLACEMENT = '•'.repeat(24); // non-empty replacement defeats clipboard-history dedup

// Plain clipboard write without a wipe timer — for public values (addresses,
// signatures) that the user may still need on the clipboard after copy.
export function copyPlain(text) {
  navigator?.clipboard?.writeText(text).catch(() => {});
}

export async function copySecret(text) {
  if (!navigator?.clipboard?.writeText) return;
  await navigator.clipboard.writeText(text);

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
    navigator?.clipboard?.writeText(WIPE_REPLACEMENT).catch(() => {});
  };

  // Early wipe when the page is hidden (navigation, lock screen, app background).
  function onHide() {
    if (document.visibilityState === 'hidden') wipe();
  }
  // Immediate wipe when the wallet locks while the page stays visible.
  function onLock() { wipe(); }

  timer = setTimeout(wipe, WIPE_MS);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
  }
  if (typeof window !== 'undefined') {
    // One-shot: onLock wipes, then cleanup() removes this listener.
    window.addEventListener(APP_LOCK_EVENT, onLock);
  }
}
