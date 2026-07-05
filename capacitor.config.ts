import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.veyrnox.app',
  appName: 'Veyrnox',
  webDir: 'dist',
  // M-A (security): restrict WebView navigation to localhost only.
  // Capacitor uses this to generate the <access> allowlist in the Cordova config.xml.
  // An empty allowNavigation array means no external URLs are permitted; the app
  // only loads from the built-in local server (capacitor://localhost / http://localhost).
  // This closes the bridge-exposure vector: external pages cannot load in the WebView
  // context and reach SecureStorage or BiometricAuth plugins.
  server: {
    allowNavigation: [],
  },
  // Bridge/console logging policy (2026-07-05 finding: the Capacitor debug bridge
  // logger echoed every native plugin result — including the hardware KEK factor H
  // and the encrypted vault blob — to the WebView console, which Android relays to
  // logcat on debug builds).
  // 'debug' = logging only when the build itself is debuggable; release builds
  // (debuggable false) inject isLoggingEnabled:false and emit NO bridge logs and NO
  // WebView-console relay (CapConfig.java maps 'debug' → loggingEnabled = isDebug;
  // Bridge/JSExport inject the flag; BridgeWebChromeClient gates the console relay
  // on the same flag via Logger.shouldLog()). This line makes the previously
  // implicit default explicit so a config change can't silently enable release logs.
  // Debug-build payload leakage is closed separately by
  // patches/@capacitor+android+8.4.1.patch / @capacitor+ios+8.4.1.patch, which
  // redact HardwareKek and SecureStorage payloads in the bridge echo logger.
  loggingBehavior: 'debug',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#4ADAC2',
    },
    // Route all fetch/XHR through the native HTTP layer on Android/iOS so that
    // CORS restrictions from https://localhost don't block external API calls
    // (ethers.js RPC, CryptoCompare, CoinGecko, Etherscan, etc.).
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
