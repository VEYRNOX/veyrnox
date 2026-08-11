// src/lib/backupNag.js — the single source of truth for the "back up your
// wallet" nag (Slice G+H, plan §1).
//
// SINGLE-TAB expectation. The state lives in localStorage / sessionStorage and
// this module does NOT synchronise across tabs (no `storage` event listener).
// Two Veyrnox tabs on the same device sharing one localStorage will each read
// the last write eventually, but the in-process subscribe fan-out only reaches
// listeners inside THIS tab. Cross-tab sync is deliberately not built.
//
// I3 — WRITES AND THE "should show?" READ ARE THE CHOKEPOINT (K-2 pattern; see
// src/lib/consent.js). Every write no-ops silently in a decoy/demo session, and
// shouldShowBackupNag() returns a bare boolean `false` in the same sessions —
// a coerced tap must never mutate a key the primary session reads, and the
// decoy UI must never nag for a "backup" of the decoy pool.

import { sha256 } from '@noble/hashes/sha256';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const STATE_KEY   = 'veyrnox-backup-state-v1';
const CADENCE_KEY = 'veyrnox-backup-nag-v1';
const SESSION_KEY = 'veyrnox-backup-nag-session-skip';

const UNLOCK_THRESHOLD = 5;
const THREE_DAYS_MS = 3 * 86_400_000;
const UNLOCK_CAP = 10;

// ── Listener fan-out ────────────────────────────────────────────────────────
const listeners = new Set();
function notify() {
  for (const cb of listeners) {
    try { cb(); } catch { /* one bad listener must not block others */ }
  }
}
export function subscribe(cb) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── Storage helpers (try/catch; parse failure == absent) ────────────────────
function readJson(store, key) {
  try {
    const raw = store.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function writeJson(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* absent storage */ }
}
function removeKey(store, key) {
  try { store.removeItem(key); } catch { /* absent storage */ }
}

// ── Fingerprint ─────────────────────────────────────────────────────────────
function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}
export function getVaultFingerprint(publicAddresses) {
  const arr = Array.isArray(publicAddresses) ? publicAddresses.slice().sort() : [];
  const input = arr.length + ':' + arr.join(',');
  return toHex(sha256(new TextEncoder().encode(input))).slice(0, 16);
}

// ── Reads ───────────────────────────────────────────────────────────────────
function readState() {
  return readJson(typeof localStorage !== 'undefined' ? localStorage : null, STATE_KEY) || null;
}
function readCadence() {
  return readJson(typeof localStorage !== 'undefined' ? localStorage : null, CADENCE_KEY) || null;
}
function readSessionSkip() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(SESSION_KEY) != null;
  } catch { return false; }
}

// ── Writers (all I3-gated) ──────────────────────────────────────────────────
export function markBackupCompleted(publicAddresses) {
  if (isDeniabilityOrDemoActive()) return;
  writeJson(localStorage, STATE_KEY, {
    fp: getVaultFingerprint(publicAddresses),
    status: 'completed',
    ts: Date.now(),
  });
  notify();
}

export function markBackupPendingConfirmation(publicAddresses) {
  if (isDeniabilityOrDemoActive()) return;
  writeJson(localStorage, STATE_KEY, {
    fp: getVaultFingerprint(publicAddresses),
    status: 'pending_confirmation',
    ts: Date.now(),
  });
  notify();
}

export function markBackupCompletedFromConfirmation() {
  if (isDeniabilityOrDemoActive()) return;
  const state = readState();
  if (!state || state.status !== 'pending_confirmation') return;
  writeJson(localStorage, STATE_KEY, { ...state, status: 'completed', ts: Date.now() });
  notify();
}

export function onVaultKeySetChanged(publicAddresses) {
  if (isDeniabilityOrDemoActive()) return;
  const fp = getVaultFingerprint(publicAddresses);
  const state = readState();
  if (state && state.fp === fp) return; // no change
  // Fingerprint changed (or first-ever): reset counters + drop stale completion.
  removeKey(localStorage, STATE_KEY);
  removeKey(localStorage, CADENCE_KEY);
  notify();
}

export function recordUnlock() {
  if (isDeniabilityOrDemoActive()) return;
  const c = readCadence() || {};
  const next = Math.min(UNLOCK_CAP, (typeof c.unlockCountSinceShown === 'number' ? c.unlockCountSinceShown : 0) + 1);
  writeJson(localStorage, CADENCE_KEY, { ...c, unlockCountSinceShown: next });
  notify();
}

export function markBackupNagShown() {
  if (isDeniabilityOrDemoActive()) return;
  writeJson(localStorage, CADENCE_KEY, { lastShownTs: Date.now(), unlockCountSinceShown: 0 });
  notify();
}

export function dismissForSession() {
  if (isDeniabilityOrDemoActive()) return;
  // Session flag suppresses within THIS session. Also bump cadence so the
  // NEXT session waits the 5-unlocks-or-3-days window before re-nagging —
  // "Not now" should mean a real quiet interval, not an immediate re-pop on
  // restart. Plan v10 §"Nag cadence". Codex code-review P2 (2026-08-11): the
  // session-only variant re-nagged on every relaunch.
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* absent */ }
  writeJson(localStorage, CADENCE_KEY, { lastShownTs: Date.now(), unlockCountSinceShown: 0 });
  notify();
}

// ── The one read the UI wires on ────────────────────────────────────────────
export function shouldShowBackupNag(publicAddresses) {
  if (isDeniabilityOrDemoActive()) return false;
  if (readSessionSkip()) return false;

  const fp = getVaultFingerprint(publicAddresses);
  const state = readState();
  // If a completed backup exists for THIS vault key set, no nag.
  if (state && state.status === 'completed' && state.fp === fp) return false;

  // Cadence: first-time OR ≥5 unlocks OR ≥3 days OR clock rollback.
  const c = readCadence();
  if (!c || typeof c.lastShownTs !== 'number') return true;
  const now = Date.now();
  if (now < c.lastShownTs) return true; // clock rollback
  if ((c.unlockCountSinceShown ?? 0) >= UNLOCK_THRESHOLD) return true;
  if (now - c.lastShownTs >= THREE_DAYS_MS) return true;
  return false;
}
