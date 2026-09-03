// @ts-nocheck
// lib/portfolioCacheStore.js
//
// Persistent portfolio-balance cache — the ONLY module in the portfolio path
// that is allowed to touch localStorage. Kept as a SEPARATE file so that the
// hard "portfolioBalances.js writes nothing to disk" guardrail
// (src/lib/__tests__/portfolioDeniability.test.js) stays intact — that scan
// exists to catch a future author who quietly persists balances into the
// aggregation module without thinking about the deniability implications.
// Every write and every read here is chokepointed by
// isDeniabilitySessionActive(): decoy / hidden / demo sessions must not
// overwrite the real user's cached figures, nor read them into the decoy view.
//
// Panic wipe erases `veyrnox-portfolio-cache` — the key is listed in
// wallet-core/panic.js METADATA_RESIDUE_KEYS. Keep those two lists in sync.
// ponytail: single key, single JSON blob; if we ever cache per-wallet-slot
// separately, split by suffix rather than growing the value shape.

import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

export const PORTFOLIO_CACHE_KEY = 'veyrnox-portfolio-cache';
// 24h hard ceiling. Beyond that we prefer an empty state to a stale hydrate:
// a device that was offline for a week showing week-old balances as if fresh
// is worse UX than a blank card that fills in seconds later.
const PORTFOLIO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function loadPortfolioCache(key) {
  if (isDeniabilitySessionActive()) return undefined;
  try {
    const raw = localStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.key !== key) return undefined;
    const age = Date.now() - (parsed.ts || 0);
    if (age < 0 || age > PORTFOLIO_CACHE_TTL_MS) return undefined;
    return parsed;
  } catch { return undefined; }
}

export function savePortfolioCache(key, data) {
  if (isDeniabilitySessionActive()) return;
  if (data == null) return; // never persist the deniable/empty return shape
  try {
    localStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ key, ts: Date.now(), data }));
  } catch { /* quota / private-mode — best-effort */ }
}
