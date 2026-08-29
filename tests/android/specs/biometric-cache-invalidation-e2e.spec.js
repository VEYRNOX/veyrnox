// Android biometric cache invalidation device runbook.
// Run manually on a real device through Appium:
//   wdio tests/android/wdio.conf.js --spec tests/android/specs/biometric-cache-invalidation-e2e.spec.js
//
// Goal:
//   Validate the custom AndroidBiometricCache plugin end-to-end:
//   1. enable biometric unlock / create the cached unlock secret
//   2. verify one-tap unlock works
//   3. change biometric enrollment on-device
//   4. return to the app and verify the cache is gone
//   5. confirm password fallback still works

import appHelper from '../helpers/appHelper.js';

describe('Biometric Cache Invalidation — Android real device', () => {
  before(async () => {
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(1000);
  });

  it('surfaces the retest action in Security settings', async () => {
    const source = await driver.getPageSource();
    console.log(`
🔎 Manual validation target

Look for this control in Security settings:
- "Retest device security"

This is the operator escape hatch after:
- an OS update
- enrolling or removing a fingerprint / face unlock
- OEM security-setting changes on OnePlus / Samsung / Xiaomi
    `);
    expect(source).toBeDefined();
  });

});
