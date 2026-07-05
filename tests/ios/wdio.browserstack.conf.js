// Appium + WebdriverIO configuration for Veyrnox iOS testing on
// BrowserStack App Automate (real cloud devices).
//
// Required environment variables:
//   BROWSERSTACK_USERNAME    - BrowserStack account username
//   BROWSERSTACK_ACCESS_KEY  - BrowserStack access key
//   BROWSERSTACK_APP_URL     - bs:// app id returned by the IPA upload endpoint
// Optional:
//   BROWSERSTACK_DEVICE      - device name (default: iPhone 17 Pro)
//   BROWSERSTACK_OS_VERSION  - iOS version (default: 18.0)
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
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:app': process.env.BROWSERSTACK_APP_URL,
      'appium:bundleId': 'com.veyrnox.app',
      'bstack:options': {
        deviceName: process.env.BROWSERSTACK_DEVICE || 'iPhone 17 Pro',
        osVersion: process.env.BROWSERSTACK_OS_VERSION || '18.0',
        projectName: 'Veyrnox',
        buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Veyrnox iOS E2E (local)',
        sessionName: 'Veyrnox iOS E2E',
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
