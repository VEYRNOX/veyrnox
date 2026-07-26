// src/lib/deviceId.js — random per-install telemetry id.
//
// NO Math.random() FALLBACK (I4, and the project RNG rule: CSPRNG only for
// anything security-relevant). This used to fall back to Math.random() when
// neither crypto.randomUUID nor crypto.getRandomValues existed. That is the
// worst possible trade for a device identifier: Math.random() is seeded from
// predictable state, so ids minted on that path are correlatable/guessable —
// and the caller could not tell a weak id from a strong one.
//
// A missing CSPRNG now returns null. Every caller already treats null as "do
// not track" (see api/trackEvent.js: `if (!deviceId) return;`), so the failure
// mode is telemetry silently disabled — never a weak identifier written to
// storage and reported to the backend.
const DEVICE_ID_KEY = 'veyrnox-device-id';

/** @type {string | null} */
let cached = null;

/** @returns {string | null} A CSPRNG-backed UUIDv4, or null if none is available. */
function mintId() {
  if (typeof crypto === 'undefined' || crypto == null) return null;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const h = [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return null; // fail closed: no CSPRNG => no id => no tracking
}

export function getOrCreateDeviceId() {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) { cached = existing; return existing; }
    const id = mintId();
    if (!id) return null; // never persist a weak id
    localStorage.setItem(DEVICE_ID_KEY, id);
    cached = id;
    return id;
  } catch {
    return null;
  }
}
