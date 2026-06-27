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
const WIPE_MS = 30_000;
// The clipboard is overwritten with this string on wipe. Note: this is an
// unconditional best-effort overwrite — we do not read back the clipboard before
// wiping, so if the user copied something else afterward, it will also be
// overwritten. It is a replacement string, not a read-back sentinel.
const WIPE_REPLACEMENT = '•'.repeat(24); // non-empty replacement defeats clipboard-history dedup

export async function copySecret(text) {
  if (!navigator?.clipboard?.writeText) return;
  await navigator.clipboard.writeText(text);

  const wipe = () => {
    // Focus may be lost (page hidden / blurred) — best effort, swallow rejection.
    navigator?.clipboard?.writeText(WIPE_REPLACEMENT).catch(() => {});
  };

  const timer = setTimeout(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onHide);
    }
    wipe();
  }, WIPE_MS);

  // Early wipe when the page is hidden (navigation, lock screen, app background).
  function onHide() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      wipe();
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
  }
}
