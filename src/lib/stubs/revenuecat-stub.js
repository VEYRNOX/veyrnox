// Stub for @revenuecat/purchases-capacitor — web/test environments only.
// The real package is only available on native (iOS/Android) builds.
// All methods in purchases.js guard with isNative() === true before use,
// so this stub is never called at runtime on web.
export const Purchases = {
  configure: () => Promise.resolve(),
  getOfferings: () => Promise.resolve({ current: null }),
  purchasePackage: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  restorePurchases: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  getCustomerInfo: () => Promise.resolve({ customerInfo: null }),
  addCustomerInfoUpdateListener: () => Promise.resolve(''),
  removeCustomerInfoUpdateListener: () => Promise.resolve(),
};
