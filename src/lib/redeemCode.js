// Open the platform's promotional-code redemption surface.
//
// iOS: RevenueCat's presentCodeRedemptionSheet() — StoreKit's own in-app offer
// code sheet (iOS 14+). Nothing leaves the app; there is no deep link at all.
// Android: the Play Store redeem page in the system browser (RevenueCat's
// Android stub for presentCodeRedemptionSheet is a logged no-op, so it cannot
// be used there).
//
// This previously called App.openUrl() from @capacitor/app. That method does
// not exist — Capacitor dropped it after v2 and it is absent from both the TS
// surface and the native plugin's method table — so every tap rejected at the
// bridge and surfaced to the user as "Could not open the store". The old unit
// tests passed only because they mocked openUrl into existence. Do not
// reintroduce App.openUrl here or in purchases.js; no-app-openurl.test.js pins
// its absence across src/.
//
// Zero egress: the store owns redemption, and the RC entitlement updates via
// the existing customer-info listener once the store confirms.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Purchases } from '@revenuecat/purchases-capacitor';

export async function redeemCode() {
  if (!Capacitor.isNativePlatform()) throw new Error('PURCHASES_NATIVE_ONLY');
  if (Capacitor.getPlatform() === 'ios') {
    await Purchases.presentCodeRedemptionSheet();
    return;
  }
  await Browser.open({ url: 'https://play.google.com/redeem' });
}
