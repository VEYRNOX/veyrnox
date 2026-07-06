// lib/TierProvider.jsx
//
// Resolves and exposes the user's real subscription tier. On mount, resolves
// once from entitlement.js (native: verified RevenueCat receipt; web: always
// 'free'), then — native only — subscribes to live customer-info updates so
// a purchase, renewal, or expiry updates the tier without an app restart.
// refreshTier() lets a caller (e.g. after "Restore Purchases") force a
// re-resolve instead of waiting for the next listener event.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { resolveTier } from '@/lib/entitlement';
import { addCustomerInfoUpdateListener, SAFETY_PLUS_ENTITLEMENT } from '@/lib/purchases';
import { TIERS } from '@/lib/tier';

const TierCtx = createContext(null);

export function TierProvider({ children }) {
  const [currentTier, setCurrentTier] = useState('free');
  const [loading, setLoading] = useState(true);

  const refreshTier = useCallback(async () => {
    const tier = await resolveTier();
    setCurrentTier(tier);
    return tier;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      const tier = await resolveTier();
      if (!cancelled) {
        setCurrentTier(tier);
        setLoading(false);
      }
    })();

    (async () => {
      // Registration is async (the plugin returns a listener id to unregister
      // with later) — if the component unmounts before it resolves, unsubscribe
      // immediately instead of leaking a live listener.
      const unsub = await addCustomerInfoUpdateListener((customerInfo) => {
        const active = customerInfo?.entitlements?.active ?? {};
        setCurrentTier(SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free');
      });
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = { currentTier, tiers: TIERS, loading, refreshTier };

  return <TierCtx.Provider value={value}>{children}</TierCtx.Provider>;
}

export function useTier() {
  const ctx = useContext(TierCtx);
  if (!ctx) throw new Error('useTier must be used within TierProvider');
  return ctx;
}
