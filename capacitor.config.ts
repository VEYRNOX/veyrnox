import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.veyrnox.app',
  appName: 'Veyrnox',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#4ADAC2',
    },
  },
};

export default config;
