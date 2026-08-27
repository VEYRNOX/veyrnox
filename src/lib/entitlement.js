//
// Resolves the user's REAL subscription tier from a verified RevenueCat
// customer-info record — never from anything the client can self-report.
// Web has no App Store/Play Store, so web always resolves 'free' without
// calling into purchases.js at all (web stays testing-only; see CLAUDE.md).
// Any error or missing entitlement fails closed to 'free' — a paid tier is
// only ever returned when RevenueCat confirms an ACTIVE entitlement.

import { Capacitor } from '@capacitor/core';
import {
  getCustomerInfo,
  SAFETY_PLUS_ENTITLEMENT,
  AI_SECURITY_PROTECTION_ENTITLEMENT,
} from './purchases';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

// DEV override: VITE_FORCE_TIER=safety_plus bypasses RevenueCat for on-device
// testing of paid features. Codex P1 2026-08-15: previously accepted in ANY
// build. A release cut with VITE_FORCE_TIER=safety_plus in the env would ship
// every install self-upgraded to the paid tier and skip RevenueCat entirely.
// Gate on import.meta.env.DEV — same pattern as VITE_DEV_UNGATE_SEND
// (src/lib/devSendOverride.js). Production evaluates FORCED_TIER to null;
// dead-code-eliminated in release builds regardless of the env string.
const FORCED_TIER = (import.meta.env.DEV || import.meta.env.VITE_ALLOW_FORCE_TIER === '1')
  ? (import.meta.env.VITE_FORCE_TIER || null)
  : null;

export async function resolveTier() {
  // I3 (deniability = ZERO backend calls): a decoy/hidden session must never make
  // a RevenueCat customer-info request. This is the single egress chokepoint for
  // getCustomerInfo — fail closed to 'free' BEFORE any network call so no coerced
  // decoy/hidden session can leak an IAP request or surface a paid tier.
  if (isDeniabilitySessionActive()) return 'free';
  // DEV override: VITE_FORCE_TIER bypasses RevenueCat for on-device testing.
  // Checked AFTER deniability so the override is honest even under a decoy session.
  if (FORCED_TIER) return FORCED_TIER;
  if (!Capacitor.isNativePlatform()) return 'free';
  try {
    const customerInfo = await getCustomerInfo();
    const active = customerInfo?.entitlements?.active ?? {};
    // Codex P2 2026-08-15: `in` walks the prototype chain, so a malformed /
    // prototype-polluted shape like Object.create({ safety_plus: {} }) would
    // unlock the paid tier without a real receipt. Own-property check + a
    // shape sanity check on the active entitlement object (RC returns
    // { identifier, isActive: true, … } — treat missing isActive as false).
    const hasAi = Object.prototype.hasOwnProperty.call(active, AI_SECURITY_PROTECTION_ENTITLEMENT);
    const aiEnt = hasAi ? active[AI_SECURITY_PROTECTION_ENTITLEMENT] : null;
    if (aiEnt && aiEnt.isActive === true) return 'ai_security_protection';

    if (!Object.prototype.hasOwnProperty.call(active, SAFETY_PLUS_ENTITLEMENT)) return 'free';
    const ent = active[SAFETY_PLUS_ENTITLEMENT];
    return ent && ent.isActive === true ? 'safety_plus' : 'free';
  } catch {
    return 'free';
  }
}
