// src/lib/referralAttribution.js
//
// Deep-link referral attribution: captures `?ref=VYX-XXXXXX` from the URL on
// app load and stores it as a pending referral for redemption at paywall time.
//
// I3: no-op in deniability/demo sessions — never read/write real referral
// state (or fire analytics) under coercion.
// I4: analytics is best-effort fire-and-forget; a failed track call must
// never block or fail referral capture.

import { setPendingReferral, getPendingReferral } from '@/lib/referral';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';

const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function captureReferralFromUrl(url = new URL(window.location.href)) {
  if (isDeniabilityOrDemoActive()) return;
  const ref = url.searchParams.get('ref')?.trim().toUpperCase();
  if (!ref || !CODE_RE.test(ref)) return;
  if (getPendingReferral() === ref) return;
  setPendingReferral(ref);
  void trackEvent(EVENT.REFERRAL_CODE_APPLIED, { code: ref, source: 'deep_link' }).catch(() => {});
}
