// Appium + WebdriverIO configuration for Veyrnox Android testing
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  runner: 'local',
  port: 4723,
  specs: [
    path.join(__dirname, 'specs', '**', '*.spec.js'),
  ],
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': '57051FDCQ008UD', // Real Pixel device
      'appium:app': path.join(__dirname, '../../android/app/build/outputs/apk/debug/app-debug.apk'),
      'appium:appPackage': 'com.veyrnox.app.debug',
      'appium:appActivity': 'com.veyrnox.app.MainActivity',
      'appium:autoGrantPermissions': true,
      'appium:autoLaunch': true,
      'appium:noReset': false,
    },
  ],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  reporters: ['spec'],
};

export default config;
