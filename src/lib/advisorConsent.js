// src/lib/advisorConsent.js — consent for sending Security Advisor questions to
// the remote AI endpoint.
//
// Audit 2026-08-03 M-5. The advisor POSTed the user's free-text questions (plus
// current_screen / wallet_chain context) to a third-party endpoint with no
// disclosure screen and no consent check. The project deliberately funnels
// telemetry through ONE egress chokepoint (api/trackEvent.js) gated by ONE
// consent chokepoint (lib/consent.js); this feature imported neither, so a user
// who had explicitly declined telemetry could still have their typed questions
// leave the device without ever being told.
//
// The I3 gate was already correct — the whole component returns null in
// deniability/demo — so this was never a deniability leak. It was a consent and
// disclosure gap, and it is fixed as one.
//
// WHY THIS IS A SEPARATE DECISION FROM TELEMETRY CONSENT: "anonymous usage
// counters" and "the questions I type go to a third-party AI" are not the same
// bargain. Reusing the telemetry answer to authorise this would silently widen
// the scope of a consent the user gave for something narrower — the same class
// of problem as H-5's understated disclosure. So it gets its own explicit
// answer, and declining is not a dead end: the advisor falls back to its local
// knowledge base, which already exists and already handles the
// no-endpoint-configured case.
//
// Structure mirrors lib/consent.js deliberately, including the I3 rule that
// WRITES are the chokepoint: this key is SHARED, so a decoy/duress/demo session
// must never mutate it. A coerced tap must not turn the real user's setting on,
// or off, or wipe their answer and leave them facing an unexplained re-prompt.
// Reads stay ungated — reading leaves no trace.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const ADVISOR_CONSENT_KEY = 'veyrnox-advisor-remote-consent';

export { ADVISOR_CONSENT_KEY };

/** 'granted' | 'denied' | null (never answered / unreadable). */
export function getAdvisorConsentState() {
  try { return localStorage.getItem(ADVISOR_CONSENT_KEY); } catch { return null; }
}

/** True ONLY on an explicit stored grant. Absent/unreadable => false (I4). */
export function hasAdvisorConsent() {
  return getAdvisorConsentState() === 'granted';
}

/** Record an explicit decision. NO-OP in a decoy/demo session (I3 — see above). */
export function setAdvisorConsent(granted) {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(ADVISOR_CONSENT_KEY, granted ? 'granted' : 'denied'); } catch { /* best-effort */ }
}

/**
 * Clear the stored decision (returns the device to "never answered").
 * NO-OP in a decoy/demo session (I3 — see above).
 */
export function clearAdvisorConsent() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(ADVISOR_CONSENT_KEY); } catch { /* best-effort */ }
}
