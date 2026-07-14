// @ts-nocheck
// lib/TierProvider.jsx
//
// Resolves and exposes the user's real subscription tier. On mount, it first
// initializes the RevenueCat SDK (configurePurchases — native-only, no-op on
// web), then resolves once from entitlement.js (native: verified RevenueCat
// receipt; web: always 'free'), then — native only — subscribes to live
// customer-info updates so a purchase, renewal, or expiry updates the tier
// without an app restart. refreshTier() lets a caller (e.g. after "Restore
// Purchases") force a re-resolve instead of waiting for the next listener event.
//
// The SDK MUST be configured before any getCustomerInfo/getOfferings call, or
// those calls reject on device. Configuration is fail-closed: if it throws
// (e.g. REVENUECAT_API_KEY_MISSING), resolveTier() still returns 'free'.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { resolveTier } from '@/lib/entitlement';
import { configurePurchases, addCustomerInfoUpdateListener, SAFETY_PLUS_ENTITLEMENT } from '@/lib/purchases';
import { TIERS } from '@/lib/tier';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

const TierCtx = createContext(null);

export function TierProvider({ children }) {
  const FORCED_TIER = import.meta.env.VITE_FORCE_TIER || null;
  const [currentTier, setCurrentTier] = useState(FORCED_TIER || 'free');
  const [loading, setLoading] = useState(true);

  const refreshTier = useCallback(async () => {
    // resolveTier() is the I3 chokepoint (returns 'free' + no egress in a
    // deniability session), so refresh is safe to call unconditionally.
    const tier = await resolveTier();
    setCurrentTier(tier);
    return tier;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // I3 (deniability = ZERO backend calls): a decoy/hidden session must make no
    // RevenueCat egress at all. Do NOT configure the SDK and do NOT register a
    // customer-info listener while a deniability session is active — fail closed
    // to 'free'. (resolveTier() also guards independently as the single egress
    // chokepoint, but we must not even initialize the SDK or open a listener.)
    if (FORCED_TIER) { setLoading(false); return () => { cancelled = true; }; }
    if (isDeniabilitySessionActive()) {
      setCurrentTier('free');
      setLoading(false);
      return () => { cancelled = true; };
    }

    // Initialize the RevenueCat SDK once, before any entitlement/offering read.
    // No-op on web; fails closed — a rejection (e.g. missing key) is swallowed
    // here so the reads below still run and resolveTier() returns 'free'.
    const configured = configurePurchases().catch(() => {});

    (async () => {
      await configured;
      const tier = await resolveTier();
      if (!cancelled) {
        setCurrentTier(tier);
        setLoading(false);
      }
    })();

    (async () => {
      await configured;
      // Registration is async (the plugin returns a listener id to unregister
      // with later) — if the component unmounts before it resolves, unsubscribe
      // immediately instead of leaking a live listener. A failed registration
      // (e.g. SDK unavailable) leaves the tier at its fail-closed resolve value.
      try {
        const unsub = await addCustomerInfoUpdateListener((customerInfo) => {
          // I3: a listener registered in the primary session survives INTO a
          // later decoy/hidden session. Gate the callback itself so it delivers
          // NO customer-info (and never a paid tier) once a deniability session
          // is active — force 'free' instead. Fail closed.
          if (isDeniabilitySessionActive()) {
            setCurrentTier('free');
            return;
          }
          const active = customerInfo?.entitlements?.active ?? {};
          setCurrentTier(SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free');
        });
        if (cancelled) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      } catch {
        // No live listener; refreshTier() can retry after a later purchase.
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
