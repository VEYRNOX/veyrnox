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

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { resolveTier } from '@/lib/entitlement';
import { configurePurchases, addCustomerInfoUpdateListener, SAFETY_PLUS_ENTITLEMENT } from '@/lib/purchases';
import { TIERS } from '@/lib/tier';
import {
  isDeniabilitySessionActive,
  DENIABILITY_SESSION_CHANGED_EVENT,
} from '@/wallet-core/deniabilitySession.js';

const TierCtx = createContext(null);

export function TierProvider({ children }) {
  const FORCED_TIER = import.meta.env.VITE_FORCE_TIER || null;
  const [currentTier, setCurrentTier] = useState(FORCED_TIER || 'free');
  const [loading, setLoading] = useState(true);

  // Codex P2 (2026-07-17) — resolveTier race on mid-flight deniability flip.
  // Every async resolveTier() invocation captures the current generation before
  // awaiting; commits are discarded if the generation has advanced (i.e. a
  // deniability flip landed while the promise was in flight). The flip-TRUE
  // force-'free' path bumps the generation so any in-flight resolve is
  // invalidated — a stale 'safety_plus' resolve cannot overwrite the local
  // force. useRef survives re-renders and unmount does not need cleanup.
  const resolveGenerationRef = useRef(0);
  const bumpResolveGeneration = useCallback(() => {
    // Wrap for safety; a numeric increment cannot throw, but future subs may.
    resolveGenerationRef.current = (resolveGenerationRef.current + 1) | 0;
    return resolveGenerationRef.current;
  }, []);

  const refreshTier = useCallback(async () => {
    // resolveTier() is the I3 chokepoint (returns 'free' + no egress in a
    // deniability session), so refresh is safe to call unconditionally.
    // Generation-guarded so a stale resolve landing after a deniability flip
    // (or a subsequent refresh) cannot overwrite the current tier state.
    bumpResolveGeneration();
    const myGen = resolveGenerationRef.current;
    const tier = await resolveTier();
    if (resolveGenerationRef.current !== myGen) return tier;
    setCurrentTier(tier);
    return tier;
  }, [bumpResolveGeneration]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // I3 (deniability = ZERO backend calls): a decoy/hidden session must make no
    // RevenueCat egress at all. Do NOT configure the SDK and do NOT register a
    // customer-info listener while a deniability session is active — fail closed
    // to 'free'. (resolveTier() also guards independently as the single egress
    // chokepoint, but we must not even initialize the SDK or open a listener.)
    if (isDeniabilitySessionActive()) {
      setCurrentTier('free');
      setLoading(false);
      return () => { cancelled = true; };
    }
    // DEV override: checked AFTER deniability so a decoy session never surfaces
    // a forced paid tier — the dev override is honest even in deniability mode.
    if (FORCED_TIER) { setLoading(false); return () => { cancelled = true; }; }

    // Initialize the RevenueCat SDK once, before any entitlement/offering read.
    // No-op on web; fails closed — a rejection (e.g. missing key) is swallowed
    // here so the reads below still run and resolveTier() returns 'free'.
    const configured = configurePurchases().catch(() => {});

    // Capture the generation for the initial resolve — a mid-flight flip
    // TRUE will bump the generation and this commit will be discarded.
    bumpResolveGeneration();
    const initialGen = resolveGenerationRef.current;
    (async () => {
      await configured;
      const tier = await resolveTier();
      if (cancelled) return;
      if (resolveGenerationRef.current !== initialGen) {
        // A deniability flip (or refresh) landed while we were awaiting.
        // Drop the stale tier value but still clear loading so consumers
        // don't hang; the flip listener has already set the correct tier.
        setLoading(false);
        return;
      }
      setCurrentTier(tier);
      setLoading(false);
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

  // I-2 fix: cached paid-tier state must not survive a mid-session flip INTO a
  // decoy/hidden session. Subscribe to DENIABILITY_SESSION_CHANGED_EVENT and:
  //   - on flip TRUE → force currentTier='free' locally (NO RC egress — I3).
  //   - on flip FALSE → re-resolve (deniability exits → real tier recomputed).
  // FORCED_TIER (dev override) short-circuits to preserve the override honestly.
  // Fail-closed: any listener error is swallowed and does not block the setter.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => {
      try {
        if (FORCED_TIER) return;
        if (isDeniabilitySessionActive()) {
          // Local force — do NOT burn an RC call in a deniability session (I3).
          // Bump the generation so any in-flight resolveTier() promise (initial
          // mount resolve, or a flip-FALSE re-resolve) cannot overwrite this
          // force when it eventually lands (Codex P2 race fix).
          bumpResolveGeneration();
          setCurrentTier('free');
        } else {
          // Flip-off: re-resolve to pick up the real tier. refreshTier() is
          // itself generation-guarded — a subsequent flip TRUE will bump the
          // generation and discard this re-resolve's commit.
          refreshTier().catch(() => setCurrentTier('free'));
        }
      } catch {
        // Fail-closed on any listener error — never leak a cached paid tier.
        setCurrentTier('free');
      }
    };
    window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, onChange);
  }, [FORCED_TIER, refreshTier, bumpResolveGeneration]);

  const value = { currentTier, tiers: TIERS, loading, refreshTier };

  return <TierCtx.Provider value={value}>{children}</TierCtx.Provider>;
}

export function useTier() {
  const ctx = useContext(TierCtx);
  if (!ctx) throw new Error('useTier must be used within TierProvider');
  return ctx;
}
