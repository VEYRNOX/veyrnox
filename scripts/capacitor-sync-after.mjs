// Capacitor regenerates both capacitor.config.json and CapApp-SPM/Package.swift.
// Re-register Veyrnox's local iOS plugins after every sync, including direct
// `npx cap sync ios` calls in CI.
//
// The Firebase patcher is imported unconditionally but now no-ops unless
// IOS_FIREBASE_OBSERVABILITY=1 — iOS ships without Firebase (F-1), so a plain
// sync must leave Package.swift untouched. See that script's header.
if (process.env.CAPACITOR_PLATFORM_NAME === 'ios') {
  await import('./register-local-ios-plugins.mjs');
  await import('./patch-ios-firebase-observability.mjs');
}
