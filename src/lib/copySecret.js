// @ts-nocheck
// lib/copySecret.js — write a secret to the OS clipboard and schedule a
// best-effort wipe after 30 s. The wipe reduces the window in which a
// background app or clipboard history feature can read the phrase.
//
// H-NEW-3 hardening:
//  - Wipe writes a NON-EMPTY replacement, not ''. Some clipboard managers (Samsung,
//    Gboard) treat an empty write as a new history entry, leaving the secret in
//    history; overwriting with real content replaces it instead.
//  - The wipe write is wrapped in .catch() — writeText requires document focus in
//    many browsers, so a backgrounded/blurred page rejects.
//  - A visibilitychange listener wipes early when the page is hidden (navigation,
//    lock screen, app background), shrinking the exposure window.
//
// Audit 2026-08-03 H-2: those last two points were in direct conflict, and the
// conflict was the bug. `writeText` rejects when the page has no focus, and the
// hidden-page trigger fires exactly when the page has no focus — so the early
// wipe's write was the one most likely to reject. The old `wipe()` marked itself
// done and tore down the TTL timer and both listeners BEFORE the write resolved,
// then swallowed the rejection, so the most common real flow (copy the phrase →
// switch apps to paste it) dismantled every retry path and left the seed on the
// clipboard indefinitely.
//
// The wipe is therefore committed only on a CONFIRMED successful write. A
// rejected write leaves every trigger armed, and a `visibilitychange` back to
// `visible` — i.e. focus has returned, so the clipboard is writable again —
// retries it. `at most once` still holds: it means at most one SUCCESSFUL wipe,
// which is what the teardown was always really guarding.
//
// Brief A, Lane 2 (re-applied from closed PR #556): locking the wallet while the
// page stays VISIBLE (panic, duress, idle, session ceiling) left the secret on the
// clipboard until the TTL — the visibilitychange trigger never fires in that case.
// WalletProvider.lock() dispatches APP_LOCK_EVENT on window; we wipe immediately.
// At most ONE wipe write SUCCEEDS across all four triggers, and the teardown
// happens on that success (see the H-2 note above — failed attempts deliberately
// do not tear down, or the retry would have nothing left to fire from).

// The event WalletProvider.lock() dispatches on window to force an immediate
// clipboard wipe the moment the wallet locks.
export const APP_LOCK_EVENT = 'veyrnox:app-lock';

const WIPE_MS = 30_000;
// The clipboard is overwritten with this string on wipe. Note: this is an
// unconditional best-effort overwrite — we do not read back the clipboard before
// wiping, so if the user copied something else afterward, it will also be
// overwritten. It is a replacement string, not a read-back sentinel.
const WIPE_REPLACEMENT = '•'.repeat(24); // non-empty replacement defeats clipboard-history dedup

// Sentinel distinguishing a rejected wipe write from a successful one without
// letting the rejection escape (an unhandled rejection here would be noise, and
// the failure is expected whenever the page lacks focus).
const WIPE_FAILED = Symbol('wipe-failed');
// Bound on retries so a clipboard that can never be written (permission revoked,
// an environment without a writable clipboard) cannot keep the listeners and the
// closed-over secret reachable for the lifetime of the page.
const MAX_WIPE_ATTEMPTS = 8;

// Plain clipboard write without a wipe timer — for public values (addresses,
// signatures) that the user may still need on the clipboard after copy.
export function copyPlain(text) {
  navigator?.clipboard?.writeText(text).catch(() => {});
}

export async function copySecret(text) {
  if (!navigator?.clipboard?.writeText) return;
  await navigator.clipboard.writeText(text);

  let done = false;      // a wipe write has been CONFIRMED to succeed
  let inFlight = false;  // a wipe write is awaiting its promise
  let attempts = 0;
  let timer = null;

  const cleanup = () => {
    if (timer != null) { clearTimeout(timer); timer = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener(APP_LOCK_EVENT, onLock);
    }
  };

  // Attempt the wipe. Tear down ONLY on a confirmed successful write — a
  // rejection (page hidden/blurred) must leave every trigger armed so a later
  // one can retry. `inFlight` collapses overlapping triggers into one write.
  const wipe = () => {
    if (done || inFlight) return;
    if (!navigator?.clipboard?.writeText) { done = true; cleanup(); return; }
    inFlight = true;
    attempts += 1;
    navigator.clipboard.writeText(WIPE_REPLACEMENT)
      .catch(() => WIPE_FAILED)
      .then((outcome) => {
        inFlight = false;
        // Give up only after MAX_WIPE_ATTEMPTS so a permanently unwritable
        // clipboard cannot keep listeners alive for the life of the page.
        if (outcome === WIPE_FAILED && attempts < MAX_WIPE_ATTEMPTS) return;
        done = true;
        cleanup();
      });
  };

  // Hidden: wipe early (navigation, lock screen, app background).
  // Visible: focus is back, so retry a wipe that previously failed. Both are
  // no-ops once `done`, and the listener is removed on the successful write.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') wipe();
    else if (attempts > 0) wipe();
  }
  // Immediate wipe when the wallet locks while the page stays visible.
  function onLock() { wipe(); }

  timer = setTimeout(wipe, WIPE_MS);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    // Removed by cleanup() once a wipe write actually lands.
    window.addEventListener(APP_LOCK_EVENT, onLock);
  }
}
