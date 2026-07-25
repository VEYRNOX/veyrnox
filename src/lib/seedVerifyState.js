// src/lib/seedVerifyState.js — Resumable seed verification checkpoint.
const PREFIX = 'veyrnox-seed-verify';

function key(walletId, suffix) { return `${PREFIX}-${suffix}-${walletId}`; }

export function saveCheckpoint(walletId, questionIndex, correctCount) {
  try { localStorage.setItem(key(walletId, 'cp'), JSON.stringify({ questionIndex, correctCount })); } catch {}
}

export function loadCheckpoint(walletId) {
  try {
    const raw = localStorage.getItem(key(walletId, 'cp'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearCheckpoint(walletId) {
  try { localStorage.removeItem(key(walletId, 'cp')); } catch {}
}

export function markVerified(walletId) {
  try {
    localStorage.setItem(key(walletId, 'verified'), '1');
    localStorage.removeItem(key(walletId, 'deferred'));
    clearCheckpoint(walletId);
  } catch {}
}

export function isVerified(walletId) {
  try { return localStorage.getItem(key(walletId, 'verified')) === '1'; } catch { return false; }
}

export function markDeferred(walletId) {
  try { localStorage.setItem(key(walletId, 'deferred'), '1'); } catch {}
}

export function isDeferred(walletId) {
  try {
    return localStorage.getItem(key(walletId, 'deferred')) === '1'
      && !isVerified(walletId);
  } catch { return false; }
}
