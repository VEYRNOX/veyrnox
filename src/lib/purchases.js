//
// Thin wrapper around the RevenueCat Capacitor plugin. Native platforms only —
// Apple/Google in-app purchase does not exist on web (web stays testing-only;
// see CLAUDE.md). Every export is a safe no-op on web so callers never need
// their own isNativePlatform() check.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

export const SAFETY_PLUS_ENTITLEMENT = 'safety_plus';

// RevenueCat standard package identifiers for the Safety Plus offering. Both
// packages grant the SAME entitlement (`safety_plus`) — annual is a pricing
// choice, not a feature difference. If a store/offering doesn't carry one of
// these yet (staged rollout), Subscription.jsx falls back to whichever is
// present — never crash, never surface a broken purchase button (I4).
export const SAFETY_PLUS_MONTHLY_PACKAGE = '$rc_monthly';
export const SAFETY_PLUS_ANNUAL_PACKAGE = '$rc_annual';

let configured = false;

function isNative() {
  return Capacitor.isNativePlatform() === true;
}

function apiKeyForPlatform() {
  return Capacitor.getPlatform() === 'ios'
    ? import.meta.env.VITE_REVENUECAT_APPLE_API_KEY
    : import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
}

export async function configurePurchases() {
  if (!isNative() || configured) return;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) throw new Error('REVENUECAT_API_KEY_MISSING');
  await Purchases.configure({ apiKey });
  // LOG-1 defence-in-depth: RevenueCat's default log level (INFO in release,
  // DEBUG in debug builds) echoes SDK activity — including customer-info dumps
  // — to logcat / os_log. Same class of leak the Capacitor bridge redaction
  // patch closed in PR #572. Force ERROR on release so only genuine failures
  // are logged; dev builds keep the default verbose logs for debugging.
  // Fail open — logging is non-critical, a rejection here must not break the
  // purchase flow (I4 boundary: configure() completing IS the security-relevant
  // event; logging quietness is best-effort hardening).
  if (import.meta.env.PROD) {
    try { await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR }); } catch { /* best-effort */ }
  }
  configured = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { current } = await Purchases.getOfferings();
  return current ?? null;
}

export async function purchasePackage(pkg) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}

export async function restorePurchases() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

export async function addCustomerInfoUpdateListener(callback) {
  if (!isNative()) return () => {};
  const listenerId = await Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
}

// Deep-link to the platform's own subscription management page (Apple: App Store
// Subscriptions; Google: Play Store Subscriptions). The Capacitor RC plugin does
// not expose the native SDK's `showManageSubscriptions`, so this uses the
// documented OS URL scheme via `@capacitor/app`. Zero egress from our code — the
// native handler opens the OS surface; no RevenueCat call. No-op on web.
export async function manageSubscription() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const url = Capacitor.getPlatform() === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  // @ts-ignore -- @capacitor/app's AppPlugin type omits `openUrl` even though it is
  // a documented runtime method (see App.openUrl docs); no runtime behavior change.
  await App.openUrl({ url });
}
