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
// Apple App Store product page — app went live 2026-07-28 as id6790188660,
// seller Veyrnox LTD (verified via public iTunes lookup + ASC API,
// per CLAUDE.md 2026-09-06 App Store section).
const APP_STORE_URL = 'https://apps.apple.com/app/id6790188660';
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

// Semantic alias — the counter tracks any high-water moment ("smart nudge"),
// not only sends. Callers on the receive / first-inbound path use this name;
// storage key stays `veyrnox-review-send-count` to preserve existing users'
// progress. Threshold + cooldown unchanged; the OS still enforces its own
// caps on top.
export const recordMilestone = recordSuccessfulSend;

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

// Manual "Rate app" from Settings — opens the store product page directly.
// Do NOT call SKStoreReviewController / Play ReviewManager here:
// `requestReview()` silently no-ops (returns void, no error) whenever the OS
// decides not to show — quota spent, throttling window, or the user's
// system-wide "In-App Ratings & Reviews" toggle is off. A manual tap that
// yields no visible response reads as broken. Apple's HIG is explicit:
// requestReview is for OPPORTUNE auto moments only; a manual "Rate app"
// button should open the store product page. Auto-trigger (SendDoneView)
// keeps using requestReview() and is unchanged.
export async function openStoreForRating() {
  if (isDeniabilityOrDemoActive()) return;
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

// Request a feature — MetaMask-style: opens an external community board
// where users post + upvote ideas (MetaMask uses community.metamask.io, a
// Discourse forum, reachable from Mobile Settings → Request a feature).
// Veyrnox uses Featurebase (free tier, public board) at the root subdomain.
// Set FEATURE_REQUEST_URL = null to fall back to the triage-templated
// mailto — useful if the board is ever temporarily removed.
//
// I3: never fires under coercion — a "the primary user wants X" signal
// leaks that a real user exists behind the decoy.
export const FEATURE_REQUEST_URL = 'https://veyrnox.featurebase.app';

async function openExternalUrl(url) {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return true;
  } catch {
    try { window.open(url, '_blank', 'noopener'); return true; }
    catch { return false; }
  }
}

export async function requestFeature() {
  if (isDeniabilityOrDemoActive()) return;
  if (FEATURE_REQUEST_URL) {
    if (await openExternalUrl(FEATURE_REQUEST_URL)) return;
  }
  const subject = encodeURIComponent('Veyrnox feature request');
  const body = encodeURIComponent(
    'What would you like Veyrnox to do?\n\n' +
    'Why is this useful to you?\n\n' +
    '(Please do not include your seed phrase, PIN, or private keys.)'
  );
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  try { window.location.href = url; } catch { /* noop */ }
}
