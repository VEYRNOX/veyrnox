// Capacitor regenerates both capacitor.config.json and CapApp-SPM/Package.swift.
// Keep Veyrnox's local iOS plugins and Firebase observability dependencies
// deterministic after every sync, including direct `npx cap sync ios` calls in CI.
if (process.env.CAPACITOR_PLATFORM_NAME === 'ios') {
  await import('./register-local-ios-plugins.mjs');
  await import('./patch-ios-firebase-observability.mjs');
}
