// src/lib/consent.js — the single source of truth for telemetry consent.
//
// This lives in its own module (rather than in analytics.js) so that
// api/trackEvent.js can gate on it WITHOUT importing analytics.js, which
// already imports trackEvent.js. One tiny leaf module breaks that cycle and
// gives every egress path exactly one consent check to honour.
//
// Consent is opt-in: absent (never answered) is NOT consent. A missing or
// unreadable localStorage is treated as "no consent" — fail closed (I4).

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

export function setConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch {}
}

/** Clear the stored decision (returns the device to "never answered"). */
export function clearConsent() {
  try { localStorage.removeItem(CONSENT_KEY); } catch {}
}
