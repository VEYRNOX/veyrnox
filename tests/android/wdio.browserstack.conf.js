// Appium + WebdriverIO configuration for Veyrnox Android testing on
// BrowserStack App Automate (real cloud devices).
//
// Required environment variables:
//   BROWSERSTACK_USERNAME    - BrowserStack account username
//   BROWSERSTACK_ACCESS_KEY  - BrowserStack access key
//   BROWSERSTACK_APP_URL     - bs:// app id returned by the APK upload endpoint
// Optional:
//   BROWSERSTACK_DEVICE      - device name (default: Google Pixel 10 Pro XL)
//   BROWSERSTACK_OS_VERSION  - Android version (default: 16.0)
//   BROWSERSTACK_BUILD_NAME  - build label shown in the BrowserStack dashboard
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY', 'BROWSERSTACK_APP_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required BrowserStack env vars: ${missing.join(', ')}`);
}

export const config = {
  runner: 'local',
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub-cloud.browserstack.com',
  port: 443,
  protocol: 'https',
  path: '/wd/hub',
  specs: [
    path.join(__dirname, 'specs', '**', '*.spec.js'),
  ],
  exclude: [
    // Attended-only legacy suite: assumes a pre-provisioned vault and a human
    // finger on the sensor ("user would provide their fingerprint"). It can
    // never legitimately pass on an unattended cloud device — run it locally
    // via wdio.conf.js instead. Superseded by hardware-kek-e2e.spec.js here.
    path.join(__dirname, 'specs', 'hardware-kek.spec.js'),
  ],
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:app': process.env.BROWSERSTACK_APP_URL,
      'appium:autoGrantPermissions': true,
      'bstack:options': {
        deviceName: process.env.BROWSERSTACK_DEVICE || 'Google Pixel 10 Pro XL',
        osVersion: process.env.BROWSERSTACK_OS_VERSION || '16.0',
        projectName: 'Veyrnox',
        buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Veyrnox Android E2E (local)',
        sessionName: 'Veyrnox E2E',
        debug: true,
        networkLogs: true,
      },
    },
  ],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  reporters: ['spec'],
};

export default config;
