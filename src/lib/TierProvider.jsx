// lib/TierProvider.jsx
//
// DISPLAY SCAFFOLD ONLY. This context exposes the current subscription tier and
// the tier catalogue for the plans/preview UI. The tier is read once from
// getCurrentTier() and stays "free" — there is NO upgrade function, no payment,
// no entitlement persistence, and nothing here changes the tier. Real billing
// (a verified IAP receipt; see lib/tier.js) will replace getCurrentTier() later;
// until then this is purely presentational and grants access to nothing.

import React, { createContext, useContext } from 'react';
import { getCurrentTier, TIERS } from '@/lib/tier';

const TierCtx = createContext(null);

export function TierProvider({ children }) {
  // The current tier, resolved from the (stubbed) entitlement source. Constant
  // for the lifetime of the app today — no setter is exposed by design, so no
  // part of the UI can simulate an upgrade or otherwise mutate it.
  const currentTier = getCurrentTier();

  const value = {
    // The string tier id, e.g. "free". Display-only.
    currentTier,
    // The full tier catalogue for rendering plan cards.
    tiers: TIERS,
  };

  return <TierCtx.Provider value={value}>{children}</TierCtx.Provider>;
}

export function useTier() {
  const ctx = useContext(TierCtx);
  if (!ctx) throw new Error('useTier must be used within TierProvider');
  return ctx;
}
