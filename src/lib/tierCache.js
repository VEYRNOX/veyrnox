// src/lib/tierCache.js
//
// Sync tier snapshot for non-React readers (e.g. approvalRiskNotes.js,
// pure helpers called outside a component). TierProvider is the SOLE
// writer — it calls setCachedTier() every time it sets its own state,
// so this mirror stays in lockstep with the React state, including the
// deniability-flip force to 'free'.
//
// Fail-closed default: 'free'. A caller that reads this before
// TierProvider has resolved sees 'free' and any paid-feature gate stays
// closed. Same shape as resolveTier() — no paid tier ever surfaces
// without a real, confirmed entitlement.

import { hasAdvisorOnlineAccess } from '@/lib/tier';

let _tier = 'free';

export function setCachedTier(tier) {
  _tier = typeof tier === 'string' && tier ? tier : 'free';
}

export function getCachedTier() {
  return _tier;
}

export function hasAdvisorOnlineAccessCached() {
  return hasAdvisorOnlineAccess(_tier);
}
