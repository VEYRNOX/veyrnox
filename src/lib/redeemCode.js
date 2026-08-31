// Deep-link into the platform's promotional-code redemption surface. iOS opens
// the App Store Offer Codes sheet; Android opens Play Store Redeem. Zero
// egress — no RevenueCat call; the store owns redemption and the RC
// entitlement updates via the existing customer-info listener once the store
// confirms. No-op on web. Mirrors the shape of purchases.manageSubscription().
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export async function redeemCode() {
  if (!Capacitor.isNativePlatform()) throw new Error('PURCHASES_NATIVE_ONLY');
  const url = Capacitor.getPlatform() === 'ios'
    ? 'itms-apps://apps.apple.com/redeem?ctx=offercodes'
    : 'https://play.google.com/redeem';
  // @ts-expect-error TS2339 — App.openUrl runtime-only in @capacitor/app@8.x
  await App.openUrl({ url });
}
