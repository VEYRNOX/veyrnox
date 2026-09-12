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

import { setPendingReferral, getPendingReferral } from '@/lib/referral';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';

// Mirrors functions/r/[code].js and referralApi.js. A code this rejects would
// be rejected by increment_referral anyway.
const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
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
  if (isDeniabilityOrDemoActive()) return;
  const ref = referralCodeFromUrl(url);
  if (!ref) return;
  if (getPendingReferral() === ref) return;
  setPendingReferral(ref);
  void trackEvent(EVENT.REFERRAL_CODE_APPLIED, { code: ref, source }).catch(() => {});
}
