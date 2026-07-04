// src/wallet-core/keystore/__tests__/hardwareKek.ios-oslog.test.js
//
// iOS-F9 — SE-unlock log trace must be CAPTURABLE from the system log.
//
// The outstanding iOS device-verification gap (iOS-F9) is that the getHardwareFactor
// Secure-Enclave unlock trace could not be captured off-device: HardwareKekPlugin.m
// logged via NSLog, and on iOS 26+ NSLog output is NOT reliably streamable via
// `idevicesyslog` / `log collect` / Console.app device filtering. Without a captured
// SE-unlock line tied to a send, the KEK-gated Sepolia txid cannot be tied to the
// SE-unlock path — so iOS stays device-verified PARTIAL.
//
// Fix: replace NSLog with os_log (unified logging) using a Veyrnox subsystem/category,
// at OS_LOG_TYPE_INFO with %{public}s so the strings are visible (not <private>-redacted)
// in the collected system log.
//
// Objective-C is not compiled or unit-tested in this JS project, so this is a
// structural source-scan guard over HardwareKekPlugin.m — the exact pattern used by
// hardwareKek.android.test.js. We strip C comments so assertions pin executable code,
// not the honesty comments that legitimately mention NSLog / os_log.
//
// This test ONLY concerns logging. It does not (and must not) assert anything about the
// enroll / unlock crypto logic, which is unchanged.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const M_PATH = resolve(here, '../../../../ios/App/App/HardwareKekPlugin.m');
const raw = readFileSync(M_PATH, 'utf8');

// Strip block and line comments so we assert on executable Objective-C, not the
// honesty comments that legitimately reference NSLog / os_log for documentation.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('HardwareKekPlugin.m — iOS-F9 os_log (streamable SE-unlock trace)', () => {
  it('imports the unified logging header <os/log.h>', () => {
    expect(code).toMatch(/#import\s+<os\/log\.h>/);
  });

  it('creates a Veyrnox os_log_t category via os_log_create', () => {
    // A single shared os_log_t handle for the plugin (subsystem + category), so all
    // traces land under one filterable subsystem/category in the system log.
    expect(code).toMatch(/os_log_create\(/);
  });

  it('uses the com.veyrnox subsystem and a HardwareKek category', () => {
    expect(code).toMatch(/os_log_create\(\s*"com\.veyrnox"\s*,\s*"HardwareKek"\s*\)/);
  });

  it('emits at least one os_log_info trace (public visibility level)', () => {
    // os_log_info == OS_LOG_TYPE_INFO. INFO/DEBUG are captured by `log collect`
    // and streamable, and are the honest level for non-error operational traces.
    expect(code).toMatch(/os_log_info\(/);
  });

  it('marks trace string args %{public}s so they are not redacted as <private>', () => {
    // Dynamic strings default to <private> in os_log; the SE-unlock marker must be
    // %{public}s to be readable in a collected trace. (No secret material is logged —
    // only fixed markers, byte lengths, and OSStatus — so public visibility is honest.)
    expect(code).toMatch(/%\{public\}/);
  });

  it('does NOT use NSLog anywhere (NSLog is not streamable on iOS 26+)', () => {
    // The whole point of iOS-F9: NSLog output cannot be reliably captured off-device.
    expect(code).not.toMatch(/\bNSLog\s*\(/);
  });

  it('keeps a stable, greppable SE-unlock success marker for capture', () => {
    // The device-verification procedure greps for this exact marker to tie a captured
    // SE-unlock to a Sepolia send. Changing it is a contract break for the verifier,
    // so it is pinned here. Documented format (see log-format doc):
    //   VEYRNOX-KEK getHardwareFactor: SUCCESS — Face ID passed, H recovered (<N> bytes)
    expect(code).toMatch(/VEYRNOX-KEK/);
    expect(code).toMatch(/getHardwareFactor: SUCCESS/);
  });
});
