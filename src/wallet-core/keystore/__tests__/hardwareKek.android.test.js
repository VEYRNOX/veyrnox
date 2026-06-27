// src/wallet-core/keystore/__tests__/hardwareKek.android.test.js
//
// H16: Android HardwareKekPlugin must require BIOMETRIC_STRONG only — no
// AUTH_DEVICE_CREDENTIAL. Allowing the device PIN/pattern/password to authorize the
// HMAC op collapses the possession factor (biometric) into a knowledge factor (PIN),
// degrading the KEK's two-factor design to two knowledge factors.
//
// Android unit tests (Robolectric/instrumented) are not wired into this JS project, so
// this is a structural source-scan guard over HardwareKekPlugin.kt — the same pattern
// used by useReceiveDetector.test.js. We strip comments so the assertions pin the actual
// Kotlin code, not the honesty comments that legitimately mention the removed constant.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const KT_PATH = resolve(
  here,
  '../../../../android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt',
);
const raw = readFileSync(KT_PATH, 'utf8');

// Strip block and line comments so we assert on executable Kotlin, not honesty comments
// that legitimately reference the removed constant.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('HardwareKekPlugin.kt — H16 biometric-only KEK', () => {
  it('does NOT reference AUTH_DEVICE_CREDENTIAL in code', () => {
    expect(code).not.toMatch(/AUTH_DEVICE_CREDENTIAL/);
  });

  it('does NOT reference DEVICE_CREDENTIAL in code', () => {
    expect(code).not.toMatch(/DEVICE_CREDENTIAL/);
  });

  it('still requires AUTH_BIOMETRIC_STRONG (biometric not weakened)', () => {
    expect(code).toMatch(/AUTH_BIOMETRIC_STRONG/);
  });

  it('still requires user authentication for key use', () => {
    expect(code).toMatch(/setUserAuthenticationRequired\(true\)/);
  });
});
