//
// Resolves the user's REAL subscription tier from a verified RevenueCat
// customer-info record — never from anything the client can self-report.
// Web has no App Store/Play Store, so web always resolves 'free' without
// calling into purchases.js at all (web stays testing-only; see CLAUDE.md).
// Any error or missing entitlement fails closed to 'free' — a paid tier is
// only ever returned when RevenueCat confirms an ACTIVE entitlement.

import { Capacitor } from '@capacitor/core';
import { getCustomerInfo, SAFETY_PLUS_ENTITLEMENT } from './purchases';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

// DEV override: VITE_FORCE_TIER=safety_plus bypasses RevenueCat for on-device
// testing of paid features. Dead-code-eliminated in release builds (no env var set).
const FORCED_TIER = import.meta.env.VITE_FORCE_TIER || null;

export async function resolveTier() {
  if (FORCED_TIER) return FORCED_TIER;
  // I3 (deniability = ZERO backend calls): a decoy/hidden session must never make
  // a RevenueCat customer-info request. This is the single egress chokepoint for
  // getCustomerInfo — fail closed to 'free' BEFORE any network call so no coerced
  // decoy/hidden session can leak an IAP request or surface a paid tier.
  if (isDeniabilitySessionActive()) return 'free';
  if (!Capacitor.isNativePlatform()) return 'free';
  try {
    const customerInfo = await getCustomerInfo();
    const active = customerInfo?.entitlements?.active ?? {};
    return SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free';
  } catch {
    return 'free';
  }
}
