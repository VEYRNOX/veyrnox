// Native store-review prompt trigger.
//
// Compliance: Apple App Store Review Guideline 1.1.7 and Google Play Ratings
// & Reviews Policy both forbid gating reviews by sentiment ("how do you like
// the app?" → thumbs → review-or-feedback branch). This module fires the OS
// native prompt directly, with no branching UI. The OS decides whether to
// display it and enforces its own caps (SKStoreReviewController: ≤3/year per
// app per user; Play ReviewManager: opaque quota).
//
// I3: never fires in deniability/demo sessions — a coerced session must not
// display a nudge that implies "the primary user has been using this app".
// Local counters are also not incremented under coercion, so a decoy can
// never advance the real user's trigger state.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const SEND_COUNT_KEY = 'veyrnox-review-send-count';
const LAST_ASKED_KEY = 'veyrnox-review-last-asked-ts';
const DECLINED_KEY = 'veyrnox-review-declined';

export const MIN_SENDS_BEFORE_PROMPT = 3;
export const MIN_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.veyrnox.app';
// iOS App Store URL populated after first App Store submission (App ID not
// yet assigned per docs/Feature-Status.md). Until then, iOS web fallback
// routes to the marketing site; native builds use the plugin, which does not
// need a URL.
const APP_STORE_URL = null;
const WEB_URL = 'https://veyrnox.com';
export const FEEDBACK_EMAIL = 'feedback@veyrnox.com';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* localStorage unavailable */ }
}

export function recordSuccessfulSend() {
  if (isDeniabilityOrDemoActive()) return;
  const current = Number(safeGet(SEND_COUNT_KEY)) || 0;
  safeSet(SEND_COUNT_KEY, String(current + 1));
}

export function markDeclined() {
  if (isDeniabilityOrDemoActive()) return;
  safeSet(DECLINED_KEY, '1');
}

function markAsked() {
  safeSet(LAST_ASKED_KEY, String(Date.now()));
}

export function shouldPromptForReview() {
  if (isDeniabilityOrDemoActive()) return false;
  if (safeGet(DECLINED_KEY)) return false;
  const count = Number(safeGet(SEND_COUNT_KEY)) || 0;
  if (count < MIN_SENDS_BEFORE_PROMPT) return false;
  const last = Number(safeGet(LAST_ASKED_KEY)) || 0;
  if (last && Date.now() - last < MIN_INTERVAL_MS) return false;
  return true;
}

function getFallbackStoreUrl() {
  try {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return PLAY_STORE_URL;
    if (/iPhone|iPad|iPod/i.test(ua)) return APP_STORE_URL || WEB_URL;
    return WEB_URL;
  } catch { return WEB_URL; }
}

// Auto-trigger from a success moment. Marks the ask timestamp BEFORE the
// call — SKStoreReviewController never reports whether the prompt was shown
// (by design), so a shown-and-dismissed prompt must not re-fire on the next
// send if the OS decides to display it now.
export async function triggerReviewPromptIfEligible() {
  if (!shouldPromptForReview()) return false;
  markAsked();
  try {
    const mod = await import('@capacitor-community/in-app-review');
    await mod.InAppReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

// Manual "Rate app" from Settings — no eligibility gate, always attempts
// the native prompt; if the plugin is unavailable (web build) open the
// store page directly.
export async function openStoreForRating() {
  if (isDeniabilityOrDemoActive()) return;
  try {
    const mod = await import('@capacitor-community/in-app-review');
    await mod.InAppReview.requestReview();
    return;
  } catch { /* fall through to URL */ }
  const url = getFallbackStoreUrl();
  if (!url) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    try { window.open(url, '_blank', 'noopener'); } catch { /* noop */ }
  }
}

export function openFeedback() {
  if (isDeniabilityOrDemoActive()) return;
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Veyrnox feedback')}`;
  try { window.location.href = url; } catch { /* noop */ }
}
