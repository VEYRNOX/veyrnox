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

// Audit 2026-08-25 M-8: `visibilitychange` never fires when the page stays
// VISIBLE but loses FOCUS (desktop window switch, a system dialog,
// picture-in-picture) — so a wipe rejected in that state had no trigger left
// to retry from. `focus`/`blur` cover exactly that gap, mirroring the
// hidden/visible pair: blur attempts a wipe, focus retries one that failed.
//
// Also M-8: giving up at MAX_WIPE_ATTEMPTS used to tear down in silence with
// the secret still on the clipboard. That is now reported on
// WIPE_EXHAUSTED_EVENT (I4 — fail honest) rather than swallowed like a
// transient retry.

import { toast } from '@/lib/toast';

// The event WalletProvider.lock() dispatches on window to force an immediate
// clipboard wipe the moment the wallet locks.
export const APP_LOCK_EVENT = 'veyrnox:app-lock';
// Dispatched on window when every wipe attempt up to MAX_WIPE_ATTEMPTS was
// rejected and the secret is still resident on the clipboard. No payload —
// this is a signal, not a data channel (I2/I3: local only, never sent
// anywhere).
export const WIPE_EXHAUSTED_EVENT = 'veyrnox:clipboard-wipe-exhausted';

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
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
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
        if (outcome === WIPE_FAILED && attempts < MAX_WIPE_ATTEMPTS) {
          // L-14 (audit 2026-09-07): RE-ARM the timer. Previously a failed
          // attempt just returned, leaving retries to depend entirely on a
          // visibility/blur/focus event arriving. On a page that simply sits
          // there — the common case for a seed-reveal screen left open — no
          // such event ever comes, so the secret stayed on the clipboard with
          // no further attempt and no notice. The event triggers remain; this
          // only guarantees the clock keeps trying up to MAX_WIPE_ATTEMPTS.
          if (timer) clearTimeout(timer);
          timer = setTimeout(wipe, WIPE_MS);
          return;
        }
        done = true;
        cleanup();
        // I4: a wipe that never landed is reported, not swallowed — the
        // secret is still sitting on the clipboard when this fires.
        if (outcome === WIPE_FAILED && typeof window !== 'undefined' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent(WIPE_EXHAUSTED_EVENT));
          // L-14 (audit 2026-09-07): tell the USER, not just the event bus.
          // WIPE_EXHAUSTED_EVENT had a definition, a dispatch and one test
          // listener — and no production consumer, so the "fail honest" half of
          // this control did not exist: the clipboard still held the secret and
          // nothing anywhere said so. Toasting from this single exhaustion point
          // rather than from each of the seven copySecret call sites keeps it one
          // chokepoint (the K-2 lesson: three guarded writers is how the fourth
          // ships unguarded). The event stays for programmatic consumers.
          try {
            toast.error(
              'Could not clear the clipboard automatically. Paste somewhere harmless or copy something else to overwrite it.',
            );
          } catch { /* toast host absent (tests, headless) — the event still fired */ }
        }
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
  // Blur: the page can stay VISIBLE but lose focus (window switch, a system
  // dialog, PiP) — visibilitychange never fires for that, so attempt a wipe
  // directly. Focus: mirrors the visible branch above, retrying a wipe that
  // previously failed for lack of focus.
  function onBlur() { wipe(); }
  function onFocus() { if (attempts > 0) wipe(); }

  timer = setTimeout(wipe, WIPE_MS);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    // Removed by cleanup() once a wipe write actually lands.
    window.addEventListener(APP_LOCK_EVENT, onLock);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
  }
}
