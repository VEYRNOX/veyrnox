//
// Resolves the user's REAL subscription tier from a verified RevenueCat
// customer-info record — never from anything the client can self-report.
// Web has no App Store/Play Store, so web always resolves 'free' without
// calling into purchases.js at all (web stays testing-only; see CLAUDE.md).
// Any error or missing entitlement fails closed to 'free' — a paid tier is
// only ever returned when RevenueCat confirms an ACTIVE entitlement.

import { Capacitor } from '@capacitor/core';
import { getCustomerInfo, SAFETY_PLUS_ENTITLEMENT } from './purchases';

export async function resolveTier() {
  if (!Capacitor.isNativePlatform()) return 'free';
  try {
    const customerInfo = await getCustomerInfo();
    const active = customerInfo?.entitlements?.active ?? {};
    return SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free';
  } catch {
    return 'free';
  }
}
