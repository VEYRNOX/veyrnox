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

// L8 — source-scan hardening. These assertions double as the failing (RED) tests
// for the M4 (API-30 guard) and L3 (re-enroll guard) fixes. Kotlin cannot be compiled
// or unit-tested in this JS project, so we pin the executable code (comments stripped).
describe('HardwareKekPlugin.kt — L8 KEK enroll hardening (M4 + L3)', () => {
  it('keeps setInvalidatedByBiometricEnrollment(true) (key dies on new biometric)', () => {
    expect(code).toMatch(/setInvalidatedByBiometricEnrollment\(true\)/);
  });

  it('keeps the per-use auth window (setUserAuthenticationParameters(0, ...))', () => {
    expect(code).toMatch(/setUserAuthenticationParameters\(0,/);
  });

  // M4 — .setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG) is API 30, but
  // minSdk=24. Without a guard, enroll() throws an opaque failure on API 24-29.
  // The enroll path must gate on Build.VERSION.SDK_INT >= 30 and reject with a clear,
  // machine-coded error so the UI can say "Hardware KEK requires Android 11+".
  it('M4: gates the KEK enroll path on Build.VERSION.SDK_INT >= 30', () => {
    expect(code).toMatch(/Build\.VERSION\.SDK_INT\s*>=\s*30/);
  });

  it('M4: rejects pre-Android-11 with the KEK_REQUIRES_ANDROID_11 machine code', () => {
    expect(code).toMatch(/KEK_REQUIRES_ANDROID_11/);
  });

  // L3 — enroll() must not silently re-key KEY_ALIAS over a LIVE kekWrap (that
  // permanently bricks the existing vault). The JS layer blocks that case via
  // isVaultWrapped() before calling the plugin. The Kotlin layer handles the stale-alias
  // case (alias exists, vault is bare — reinstall+restore) by force-deleting the stale
  // key before enrolling fresh. If deletion fails, it rejects with KEK_CLEAR_STALE_FAILED
  // so the JS classifier can surface an actionable message (never GENERIC_MSG stuck loop).
  it('L3: pre-checks containsAlias(KEY_ALIAS) before generating a new key', () => {
    expect(code).toMatch(/containsAlias\(KEY_ALIAS\)/);
  });

  it('L3: auto-clears a stale alias via deleteEntry() on reinstall+restore', () => {
    expect(code).toMatch(/deleteEntry\(KEY_ALIAS\)/);
  });

  it('L3: rejects with KEK_CLEAR_STALE_FAILED when stale alias deletion fails', () => {
    expect(code).toMatch(/KEK_CLEAR_STALE_FAILED/);
  });
});
