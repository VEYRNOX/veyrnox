// Appium + WebdriverIO configuration for Veyrnox iOS testing on a LOCAL Mac.
//
// Unlike the Android local runner, iOS device automation REQUIRES macOS + Xcode
// (WebDriverAgent is built and signed by Xcode) and a REAL iPhone — the iOS
// Simulator has no Secure Enclave, so every Hardware KEK / SE / Face ID spec is
// meaningless on a simulator. This config therefore targets a real, USB-attached,
// developer-provisioned iPhone.
//
// Required environment variables:
//   IOS_UDID          - the device UDID (`xcrun xctrace list devices`)
//   IOS_TEAM_ID       - Apple Developer Team ID used to sign WebDriverAgent
// Optional:
//   IOS_APP_PATH      - path to a built .app/.ipa to (re)install; omit to use the
//                       already-installed build and set noReset
//   IOS_PLATFORM_VER  - iOS version string (default: 18.0)
//   VEYRNOX_IOS_BUNDLE_ID - app bundle id (default: com.veyrnox.app)
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ['IOS_UDID', 'IOS_TEAM_ID'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required iOS env vars: ${missing.join(', ')}. ` +
      `iOS device automation needs a real device UDID and an Xcode signing team.`
  );
}

const bundleId = process.env.VEYRNOX_IOS_BUNDLE_ID || 'com.veyrnox.app';

const deviceCap = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:udid': process.env.IOS_UDID,
  'appium:deviceName': 'iPhone',
  'appium:platformVersion': process.env.IOS_PLATFORM_VER || '18.0',
  'appium:bundleId': bundleId,
  'appium:xcodeOrgId': process.env.IOS_TEAM_ID,
  'appium:xcodeSigningId': 'iPhone Developer',
  'appium:autoAcceptAlerts': false, // keep Face ID / permission sheets visible for supervised runs
  'appium:includeSafariInWebviews': true,
  'appium:webviewConnectTimeout': 30000,
};

// If a fresh build path is provided, install it; otherwise reuse what's on device.
if (process.env.IOS_APP_PATH) {
  deviceCap['appium:app'] = path.resolve(process.env.IOS_APP_PATH);
  deviceCap['appium:noReset'] = false;
} else {
  deviceCap['appium:noReset'] = true;
}

export const config = {
  runner: 'local',
  port: 4723,
  specs: [path.join(__dirname, 'specs', '**', '*.spec.js')],
  maxInstances: 1,
  capabilities: [deviceCap],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // biometric / SE prompts are slow; give supervised specs room
  },
  reporters: ['spec'],
};

export default config;
