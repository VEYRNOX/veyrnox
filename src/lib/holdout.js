// src/lib/holdout.js — 10% notification holdout for measurement.
// Set once at wallet_ready, not at install (avoids polluting onboarding funnel).

const KEY = 'veyrnox-holdout';

// Uses crypto.getRandomValues to match the codebase-wide RNG rule
// (scripts/check-crypto-rng.mjs). Assignment is one-shot and never re-rolled,
// so a single 32-bit sample is more than enough resolution for a 10% split
// (~10.7% granularity: 429_496_729 / 2^32).
const HOLDOUT_THRESHOLD = Math.floor(0.1 * 0x1_0000_0000);

export function assignHoldout() {
  try {
    if (localStorage.getItem(KEY)) return;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const group = buf[0] < HOLDOUT_THRESHOLD ? 'control' : 'treatment';
    localStorage.setItem(KEY, group);
  } catch (e) {
    console.warn('[holdout] assignHoldout failed:', e);
  }
}

export function isInHoldout() {
  return getHoldoutGroup() === 'control';
}

export function getHoldoutGroup() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
