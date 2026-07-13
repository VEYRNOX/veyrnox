// src/__tests__/bridge-log-redaction.test.js
//
// Regression guard for the Capacitor bridge-logger secret leak (2026-07-05).
//
// Capacitor's debug bridge logger (createLogFromNative in native-bridge.js)
// echoes EVERY native plugin result to the WebView console, and Android relays
// the WebView console to logcat. On a Pixel debug build this was captured
// leaking, in cleartext, adb-accessible logs of:
//   1. the hardware KEK factor H — HardwareKek.getHardwareFactor → {"h":"<b64>"}
//   2. the full encrypted vault blob — SecureStorage.get
// which undermines the offline-seizure story for any debug build, and the
// Appium CI pipeline persisted that logcat into CI artifacts.
//
// The fix is the LOGGER, not the bridge (the bridge must carry H by design):
// patch-package patches redact HardwareKek and SecureStorage payloads inside
// createLogFromNative / createLogToNative. Release builds were already silent
// (loggingBehavior 'debug' → isLoggingEnabled:false on non-debuggable builds),
// now made explicit in capacitor.config.ts.
//
// This static guard fails the build if:
//   - the patch files disappear or stop covering both sensitive plugins or
//     both log directions (e.g. a Capacitor upgrade without regenerating the
//     patch — note patch-package's postinstall would also fail, this is the
//     in-suite signal);
//   - capacitor.config.ts loses the explicit loggingBehavior, or someone flips
//     it to 'production' (which would enable bridge logs on RELEASE builds).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const patchFiles = readdirSync(resolve(root, 'patches'));

// "^8.4.1" → "8.4.1". The patch filename embeds the exact installed version.
const exact = (range) => range.replace(/^[~^]/, '');

const SENSITIVE_PLUGINS = ['HardwareKek', 'SecureStorage'];

describe.each([
  ['@capacitor/android', exact(pkg.dependencies['@capacitor/android'])],
  ['@capacitor/ios', exact(pkg.dependencies['@capacitor/ios'])],
])('bridge log-redaction patch for %s', (name, version) => {
  const fileName = `${name.replace('/', '+')}+${version}.patch`;

  it(`patches/${fileName} exists for the installed version`, () => {
    expect(
      patchFiles,
      `expected ${fileName} in patches/ — if Capacitor was upgraded, ` +
        'regenerate the log-redaction patch (see the patch file header comment)'
    ).toContain(fileName);
  });

  it('redacts payloads for every sensitive plugin, in both log directions', () => {
    const patch = readFileSync(resolve(root, 'patches', fileName), 'utf8');
    for (const plugin of SENSITIVE_PLUGINS) {
      expect(patch, `${fileName} must list ${plugin} as sensitive`).toContain(
        `'${plugin}'`
      );
    }
    // Results echoed FROM native (carries H, vault blob) …
    expect(patch).toContain('veyrnoxSanitizeResult');
    // … and calls echoed TO native (SecureStorage.set carries the blob too).
    expect(patch).toContain('veyrnoxSanitizeCall');
    // Only the logger is patched — never the bridge result path itself.
    expect(patch).not.toContain('returnResult');
  });
});

describe('capacitor.config.json logging policy', () => {
  const config = JSON.parse(readFileSync(resolve(root, 'capacitor.config.json'), 'utf8'));

  it("pins loggingBehavior explicitly to 'debug'", () => {
    expect(config.loggingBehavior).toBe('debug');
  });

  it("never sets loggingBehavior 'production' (would enable bridge logs on release builds)", () => {
    expect(config.loggingBehavior).not.toBe('production');
  });
});
