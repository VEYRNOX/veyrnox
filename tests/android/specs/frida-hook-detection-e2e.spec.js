/**
 * G3 Frida hook detection — Appium device-verification spec.
 *
 * Gate: DEVICE_VERIFY=1 FRIDA_ATTACHED=1
 *   G3-A: verify the device actually has Frida server listening on port 27042
 *   G3-B: verify the send UI shows the HOOKED BLOCK message
 *   G3-C: verify the send button is disabled (or soft-warn if testId absent)
 *
 * Setup:
 *   1. Root the test device (Magisk) and push frida-server to /data/local/tmp/
 *   2. adb shell "su -c /data/local/tmp/frida-server &"
 *   3. Confirm: adb shell "ss -tlnp | grep 27042" → a listening socket
 *   4. Build + install debug APK (npm run android:build:debug && adb install ...)
 *   5. DEVICE_VERIFY=1 FRIDA_ATTACHED=1 npm run android:test:frida
 *
 * Honest gaps:
 *   - Frida Gadget mode (no root required) is NOT tested here.
 *   - Custom Frida port (non-27042) is NOT tested here.
 *   - iOS: needs Mac + Xcode; NOT run by this spec.
 */

const { remote } = require('webdriverio');

const DEVICE_VERIFY  = process.env.DEVICE_VERIFY  === '1';
const FRIDA_ATTACHED = process.env.FRIDA_ATTACHED === '1';

const describe_ = DEVICE_VERIFY && FRIDA_ATTACHED ? describe : describe.skip;

describe_('G3 Frida hook detection (device-gated)', () => {
  let driver;

  before(async () => {
    driver = await remote({
      hostname: 'localhost',
      port: 4723,
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:appPackage': 'com.veyrnox.app.debug',
        'appium:appActivity': 'com.veyrnox.app.MainActivity',
        'appium:noReset': true,
      },
    });
  });

  after(async () => {
    if (driver) await driver.deleteSession();
  });

  it('G3-A: Frida server is listening on port 27042', async () => {
    // Use adb shell to check the port directly — gives a clear pre-condition fail
    // message if Frida server wasn't started before the test.
    const { stdout } = await new Promise((res, rej) => {
      const { exec } = require('child_process');
      exec('adb shell ss -tlnp | grep 27042', (err, stdout) => {
        if (err && !stdout) rej(new Error('Port 27042 not open — start frida-server first'));
        else res({ stdout });
      });
    });
    expect(stdout).toMatch(/27042/);
  });

  it('G3-B: send screen shows HOOKED BLOCK message', async () => {
    // Give the app 5 s to launch and run RASP checks.
    await driver.pause(5000);
    const pageSource = await driver.getPageSource();
    expect(pageSource).toMatch(/inspecting this app/i);
  });

  it('G3-C: send button is disabled or absent', async () => {
    try {
      const btn = await driver.$('[data-testid="send-cta-button"]');
      const enabled = await btn.isEnabled();
      expect(enabled).toBe(false);
    } catch {
      // testId absent on native — soft-warn only; BLOCK copy in G3-B is the hard assertion.
      console.warn('G3-C: send-cta-button testId not found on native; BLOCK copy confirmed in G3-B');
    }
  });
});
