// src/lib/consent.js — the single source of truth for telemetry consent.
//
// This lives in its own module (rather than in analytics.js) so that
// api/trackEvent.js can gate on it WITHOUT importing analytics.js, which
// already imports trackEvent.js. One tiny leaf module breaks that cycle and
// gives every egress path exactly one consent check to honour.
//
// Consent is opt-in: absent (never answered) is NOT consent. A missing or
// unreadable localStorage is treated as "no consent" — fail closed (I4).
//
// I3 — WRITES ARE THE CHOKEPOINT. veyrnox-telemetry-consent is SHARED: the
// primary wallet reads whatever any session wrote. So a decoy/duress/stealth or
// demo session must never mutate it — a coerced tap must not turn the real
// user's telemetry on, or off, or wipe their answer and leave them facing an
// unexplained re-prompt. That guard lives HERE rather than at each call site,
// for the same reason the egress guard lives in api/trackEvent.js: there were
// three writers (TelemetryConsent.choose, Settings' Privacy switch, and
// WalletEntry's fresh-create reset), one of them added without the check, and a
// rule enforced in three places is a rule that will be missed in a fourth.
// Reads stay ungated — reading cannot leave a trace, and trackEvent.js already
// suppresses egress in these sessions independently.
//
// deniabilitySession is a true leaf (zero imports), so gating here keeps this
// module acyclic and preserves the cycle-break described above.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const CONSENT_KEY = 'veyrnox-telemetry-consent';

export { CONSENT_KEY };

/** 'granted' | 'denied' | null (never answered / unreadable). */
export function getConsentState() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

/** True ONLY on an explicit stored grant. Absent/unreadable => false (I4). */
export function hasConsent() {
  return getConsentState() === 'granted';
}

/** Record an explicit decision. NO-OP in a decoy/demo session (I3 — see above). */
export function setConsent(granted) {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch {}
}

/**
 * Clear the stored decision (returns the device to "never answered").
 * NO-OP in a decoy/demo session (I3 — see above).
 */
export function clearConsent() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(CONSENT_KEY); } catch {}
}
