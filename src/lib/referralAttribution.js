// src/lib/referralAttribution.js
//
// Referral attribution from an inbound URL. Two shapes reach us:
//
//   web    https://…/?ref=VYX-XXXXXX   — the Pages/Worker redirect's landing
//                                        (functions/r/[code].js), read on load
//   native https://veyrnox.com/r/VYX-XXXXXX — the share link itself, delivered
//                                        as a universal/app link straight into
//                                        the installed app (DeepLinkHandler.jsx)
//
// Both store the code as a pending referral; WalletProvider redeems it on the
// next primary-session unlock (increment_referral). Before the native shape
// existed (#2527), a phone user who tapped a share link and then installed the
// app arrived with nothing — the capture had happened in the browser's storage.
//
// I3: no-op in deniability/demo sessions — never read/write real referral
// state (or fire analytics) under coercion.
// I4: analytics is best-effort fire-and-forget; a failed track call must
// never block or fail referral capture.

import { Capacitor } from '@capacitor/core';
import { setPendingReferral, getPendingReferral, hasRedeemed } from '@/lib/referral';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';

// Mirrors functions/r/[code].js and referralApi.js. A code this rejects would
// be rejected by increment_referral anyway.
const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
// Pages routing's match for functions/r/[code].js, measured live (#2534): one
// segment, optional single trailing slash. workers/referral-redirect pins this
// exact literal, so the three readers cannot drift apart silently.
const PATH_RE = /^\/r\/([^/]+)\/?$/;

// The referral code carried by a URL, normalised, or null. `?ref=` wins over
// the path so the web landing (`/?ref=`) is unaffected by anything a future
// path might carry.
export function referralCodeFromUrl(url) {
  let raw = url.searchParams.get('ref');
  if (raw == null) {
    const m = PATH_RE.exec(url.pathname);
    if (!m) return null;
    try {
      raw = decodeURIComponent(m[1]);
    } catch {
      return null; // malformed %-escape: not a code
    }
  }
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function captureReferralFromUrl(url = new URL(window.location.href), source = 'deep_link') {
  if (isDeniabilityOrDemoActive()) return 'denied';
  const ref = referralCodeFromUrl(url);
  if (!ref) return 'invalid';
  const pending = getPendingReferral();
  if (pending) return pending === ref ? 'duplicate' : 'already_pending';
  setPendingReferral(ref);
  void trackEvent(EVENT.REFERRAL_CODE_APPLIED, { code: ref, source }).catch(() => {});
  return 'captured';
}

// Manual entry (the Create Wallet invite field, #2569). Same validator, event
// and deniability gate as a link, via the same entry point. Returns false for a
// malformed code so the caller can say so; a valid code returns true even in a
// deniable session, where captureReferralFromUrl stores nothing.
export function captureReferralCode(raw, source = 'manual_entry') {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return false;
  captureReferralFromUrl(new URL(`http://localhost/?ref=${encodeURIComponent(code)}`), source);
  return true;
}

// Play Store listing that hands `ref=<code>` back to the installed app through
// the Install Referrer API (#2541). The whole referrer value is URL-encoded, as
// Play requires.
export function playStoreReferralUrl(code) {
  return 'https://play.google.com/store/apps/details?id=com.veyrnox.app&referrer='
    + encodeURIComponent(`ref=${code}`);
}

// Android, on launch: pick up a code that arrived through a Play install. Play
// keeps the referrer for the life of the install, so skip once a code is pending
// or already redeemed. An organic install's referrer
// (utm_source=google-play&utm_medium=organic) carries no `ref` and is ignored.
// ponytail: a code the server rejects is re-captured on each launch until the
// user redeems another; add a checked-once flag (and its panic residue entry) if
// that telemetry noise ever matters.
export async function captureInstallReferrer() {
  if (Capacitor.getPlatform() !== 'android') return;
  if (isDeniabilityOrDemoActive() || hasRedeemed() || getPendingReferral()) return;
  let referrer;
  try {
    // Lazy: keeps the plugin registration out of web/iOS and module load.
    const { getInstallReferrer } = await import('@/plugins/installReferrer');
    referrer = await getInstallReferrer();
  } catch {
    return; // no Play Store, service error, or a non-Play flavour
  }
  const code = new URLSearchParams(referrer).get('ref');
  if (!code) return;
  const url = new URL('http://localhost/');
  url.searchParams.set('ref', code);
  // Re-checks I3 itself: the await above can outlive a session switch.
  captureReferralFromUrl(url, 'install_referrer');
}
