// src/lib/seedVerifyState.js — Resumable seed verification checkpoint.
//
// ALL state lives under ONE localStorage key. It previously used one key per
// wallet (`veyrnox-seed-verify-verified-<walletId>`), so a storage dump let
// anyone COUNT the wallets on the device by counting keys — the wallet
// enumeration this product exists to prevent. A single blob keeps the key
// namespace constant no matter how many wallets exist, and gives panic wipe
// exactly one key to remove.
const STORE_KEY = 'veyrnox-seed-verify';

function readAll() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeAll(map) {
  try {
    // Drop the key entirely when nothing is left, so an empty store leaves no
    // residue behind at all.
    if (!map || Object.keys(map).length === 0) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {}
}

function entry(walletId) {
  const e = readAll()[walletId];
  return e && typeof e === 'object' ? e : {};
}

function update(walletId, patch) {
  const all = readAll();
  const prev = all[walletId] && typeof all[walletId] === 'object' ? all[walletId] : {};
  const next = { ...prev, ...patch };
  // Undefined means "remove"; prune so the blob does not grow forever.
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  if (Object.keys(next).length === 0) delete all[walletId];
  else all[walletId] = next;
  writeAll(all);
}

// `positions` is the list of word positions this quiz challenges. It is part
// of the checkpoint so a resumed quiz asks the SAME questions it started with.
// Without it, positions were re-randomised on every mount while correctCount
// carried over — so "resume" silently became a different quiz, and repeated
// skip/resume cycles let a user reroll questions until they got easy ones.
export function saveCheckpoint(walletId, questionIndex, correctCount, positions) {
  const cp = { questionIndex, correctCount };
  if (Array.isArray(positions)) cp.positions = [...positions];
  update(walletId, { cp });
}

export function loadCheckpoint(walletId) {
  const cp = entry(walletId).cp;
  return cp && typeof cp === 'object' ? cp : null;
}

export function clearCheckpoint(walletId) {
  update(walletId, { cp: undefined });
}

export function markVerified(walletId) {
  update(walletId, { verified: true, deferred: undefined, cp: undefined });
}

export function isVerified(walletId) {
  return entry(walletId).verified === true;
}

export function markDeferred(walletId) {
  update(walletId, { deferred: true });
}

export function isDeferred(walletId) {
  const e = entry(walletId);
  return e.deferred === true && e.verified !== true;
}
