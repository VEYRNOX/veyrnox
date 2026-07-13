// M13 device-verification spec — Android FLAG_SECURE screenshot block.
//
// PURPOSE: Close the M13 audit gap by confirming that FLAG_SECURE applied in
// MainActivity.java:27-30 actually blocks `adb screencap` on the Capacitor
// WebView at runtime — not just the native window chrome.
//
// WHY THIS MATTERS: FLAG_SECURE is set at the Activity window level (onCreate).
// It should propagate to the WebView surface, but this has never been confirmed
// on a real device. The gap is that a seized device running `adb exec-out screencap`
// must return an all-black PNG — if the WebView renders through a separate surface
// that FLAG_SECURE does not cover, the seed and balance screens would be capturable.
//
// VERIFICATION METHOD: `adb shell screencap -p` writes a PNG that honours
// FLAG_SECURE (returns all-black when the flag is set, on Android 5+). We check
// the file size as a proxy: an all-black 1080p PNG compresses to < 20 KB;
// a real app screenshot is 200 KB+. This is a conservative 50 KB threshold.
//
// RUN (requires real Android device + ADB, never in CI):
//   DEVICE_VERIFY=1 npm run android:test:flag-secure
//
// Honest gaps this spec cannot close:
//   - Emulator AVDs may not enforce FLAG_SECURE on all Android versions — use
//     a real device.
//   - Screen recording via MediaProjection (requires user consent dialog) is a
//     separate attack surface not tested here.
//   - The spec navigates to the wallet home screen; it does not exercise the
//     seed-reveal flow end-to-end (requires a funded vault + PIN).
//
// See: docs/rasp-validation-roadmap.md §M13, MainActivity.java:20-30.

import appHelper from '../helpers/appHelper.js';

const DEVICE_VERIFY = process.env.DEVICE_VERIFY === '1';
const SCREENSHOT_PATH = '/data/local/tmp/veyrnox_flag_secure_test.png';

// An all-black PNG at any phone resolution compresses to well under 20 KB.
// A real app screenshot at 1080p is 200 KB+. 50 KB is a conservative threshold.
const MAX_BLACK_PNG_BYTES = 50_000;

async function adbShell(cmd) {
  return driver.execute('mobile: shell', { command: cmd, includeStderr: true });
}

async function screencapSizeBytes(path) {
  await adbShell(`screencap -p ${path}`);
  const wcOut = await adbShell(`wc -c ${path}`);
  const bytes = parseInt(String(wcOut).trim().split(/\s+/)[0], 10);
  await adbShell(`rm -f ${path}`).catch(() => {});
  return bytes;
}

describe('M13 — FLAG_SECURE screenshot block (device-gated)', function () {
  before(async function () {
    if (!DEVICE_VERIFY) return;
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(2000);
  });

  it('DEVICE_GUARD: skips unless DEVICE_VERIFY=1', function () {
    if (!DEVICE_VERIFY) {
      console.log('[M13] Skipped — run with DEVICE_VERIFY=1 on a real Android device');
      return;
    }
    expect(DEVICE_VERIFY).toBe(true);
  });

  it('M13-A: screencap on the wallet home screen returns an all-black PNG', async function () {
    if (!DEVICE_VERIFY) return;

    const bytes = await screencapSizeBytes(SCREENSHOT_PATH);
    console.log(`[M13-A] Screencap size on home screen: ${bytes} bytes (expect < ${MAX_BLACK_PNG_BYTES})`);

    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(MAX_BLACK_PNG_BYTES);
  });

  it('M13-B: screencap while WebView is rendering (not just native chrome) returns black', async function () {
    if (!DEVICE_VERIFY) return;

    // Trigger a WebView render by waiting for the main JS bundle to settle.
    // A non-black result here means FLAG_SECURE does not cover the WebView surface.
    await appHelper.pause(3000);

    const bytes = await screencapSizeBytes(SCREENSHOT_PATH.replace('.png', '_webview.png'));
    console.log(`[M13-B] Screencap size after WebView settle: ${bytes} bytes (expect < ${MAX_BLACK_PNG_BYTES})`);

    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(MAX_BLACK_PNG_BYTES);
  });

  it('M13-C: driver.takeScreenshot() also returns a black frame (UiAutomator2 respects FLAG_SECURE)', async function () {
    if (!DEVICE_VERIFY) return;

    // UiAutomator2 takeScreenshot() on Android 10+ uses SurfaceControl.screenshot()
    // which respects FLAG_SECURE. Earlier versions may bypass it — record the result
    // for human review rather than failing (the ADB screencap check above is authoritative).
    const b64 = await driver.takeScreenshot();
    const bytes = Buffer.from(b64, 'base64').length;
    console.log(`[M13-C] UiAutomator2 screenshot size: ${bytes} bytes (< ${MAX_BLACK_PNG_BYTES} = FLAG_SECURE respected)`);

    // Soft assertion — log a warning rather than hard-failing if UiAutomator2 bypasses.
    if (bytes >= MAX_BLACK_PNG_BYTES) {
      console.warn(
        '[M13-C] WARNING: UiAutomator2 screenshot NOT black — this driver may bypass FLAG_SECURE. ' +
        'The ADB screencap checks (M13-A/B) are authoritative. Check Android version and UiAutomator2 version.',
      );
    } else {
      expect(bytes).toBeLessThan(MAX_BLACK_PNG_BYTES);
    }
  });
});
