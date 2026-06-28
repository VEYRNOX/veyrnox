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
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#4ADAC2',
    },
  },
};

export default config;
