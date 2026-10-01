// src/lib/introTrialEligibility.js
//
// Whether THIS user can still take the App Store introductory offer (the 14-day
// free trial). The package's `introPrice` is present for everyone, so it cannot
// say. Read-only: it never touches offers, entitlements or purchase calls, which
// stay in purchases.js.
//
// iOS only: on Android the plugin always answers UNKNOWN, and Play signals
// eligibility by exposing the trial option (see freeTrial.js). Anything but a
// positive ELIGIBLE answer is false, which keeps price-only copy on screen — the
// instruction the SDK itself gives for UNKNOWN.
//
// Same chokepoint rule as getOfferings in purchases.js: no RevenueCat call in a
// decoy/demo session (I3).

import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

// RevenueCat's INTRO_ELIGIBILITY_STATUS_ELIGIBLE. Compared by value rather than
// imported: the enum is not part of every test double for the plugin, and a
// missing import would read `undefined`, which no status equals, so the check
// would fail closed anyway — but silently, for the wrong reason.
const INTRO_ELIGIBLE = 2;

export async function checkIntroTrialEligibility(pkg) {
  if (Capacitor.isNativePlatform() !== true || Capacitor.getPlatform() !== 'ios') return false;
  if (isDeniabilityOrDemoActive()) return false;
  const id = pkg?.product?.identifier;
  if (!id) return false;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility({
      productIdentifiers: [id],
    });
    return result?.[id]?.status === INTRO_ELIGIBLE;
  } catch {
    return false;
  }
}
