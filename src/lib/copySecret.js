// lib/copySecret.js — write a secret to the OS clipboard and schedule a
// best-effort wipe after 30 s. The wipe reduces the window in which a
// background app or clipboard history feature can read the phrase.
const WIPE_MS = 30_000;

export async function copySecret(text) {
  if (!navigator?.clipboard?.writeText) return;
  await navigator.clipboard.writeText(text);
  setTimeout(() => {
    navigator?.clipboard?.writeText('');
  }, WIPE_MS);
}
