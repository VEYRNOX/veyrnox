// H-NEW-5 (ANDROID half) — source-scan test pinning the HONEST status of biometric
// cache invalidation on Android.
//
// Context: the old generic Android secure-storage path could not invalidate the
// cached vault password on biometric enrollment change. The current code ships a
// custom Android plugin for THAT half, while the iOS half remains outstanding.
// This test pins the honest partial-shipment language in the source.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'biometricUnlock.js'), 'utf8');

describe('H-NEW-5 Android — biometric cache invalidation status is documented honestly', () => {
  it('names setInvalidatedByBiometricEnrollment or biometryCurrentSet in a comment', () => {
    expect(/setInvalidatedByBiometricEnrollment|biometryCurrentSet/.test(SRC)).toBe(true);
  });

  it('flags an explicit H-NEW-5 STATUS comment', () => {
    expect(/H-NEW-5 STATUS/i.test(SRC)).toBe(true);
    expect(/ANDROID HALF is now shipped/i.test(SRC)).toBe(true);
  });

  it('keeps the iOS half honest as still TARGET', () => {
    expect(/iOS half remains TARGET/i.test(SRC)).toBe(true);
  });

  it('explains the Android mitigation uses a custom plugin and invalidation sentinel', () => {
    expect(/custom.*AndroidBiometricCache plugin|invalidation sentinel/i.test(SRC)).toBe(true);
  });

  it('does not falsely claim full cross-platform parity', () => {
    expect(/Full cross-platform parity remains TARGET/i.test(SRC)).toBe(true);
  });
});
