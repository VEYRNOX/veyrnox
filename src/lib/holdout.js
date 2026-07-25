// src/lib/holdout.js — 10% notification holdout for measurement.
// Set once at wallet_ready, not at install (avoids polluting onboarding funnel).

const KEY = 'veyrnox-holdout';

export function assignHoldout() {
  try {
    if (localStorage.getItem(KEY)) return;
    const group = Math.random() < 0.1 ? 'control' : 'treatment';
    localStorage.setItem(KEY, group);
  } catch {}
}

export function isInHoldout() {
  return getHoldoutGroup() === 'control';
}

export function getHoldoutGroup() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
