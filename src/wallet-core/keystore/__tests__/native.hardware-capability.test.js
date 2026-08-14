import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isEligibleHardwareCapability } from '../native.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('native secure-hardware capability', () => {
  it.each([
    ['secureEnclave', true],
    ['strongBox', true],
    ['tee', true],
    ['software', false],
    ['unknown', false],
    ['none', false],
  ])('accepts only an enrolled, approved backing tier: %s', (backing, expected) => {
    expect(isEligibleHardwareCapability({ backing, biometryEnrolled: true })).toBe(expected);
  });

  it('rejects a hardware tier when strong biometry is not enrolled', () => {
    expect(isEligibleHardwareCapability({ backing: 'strongBox', biometryEnrolled: false })).toBe(false);
    expect(isEligibleHardwareCapability({ backing: 'tee' })).toBe(false);
  });

  it('Android capability uses and deletes a distinct disposable alias', () => {
    const src = readFileSync(
      resolve(ROOT, 'android/app/src/main/java/com/veyrnox/app/EnclaveKeyService.kt'),
      'utf8',
    );
    const capability = src.slice(src.indexOf('fun capability('), src.indexOf('/**\n     * Create the single'));

    expect(capability).toContain('EnclaveKeySpecConfig.MIN_API');
    expect(capability).toContain('CAPABILITY_PROBE_ALIAS');
    expect(capability).toContain('readSecurityLevel(ks, CAPABILITY_PROBE_ALIAS)');
    expect(capability).toContain('finally');
    expect(capability).toContain('deleteAliasIfPresent(ks, CAPABILITY_PROBE_ALIAS)');
    expect(capability).not.toContain('EnclaveKeySpecConfig.KEY_ALIAS');
  });

  it('caches the capability decision for one app process instead of every unlock', () => {
    const src = readFileSync(resolve(ROOT, 'src/wallet-core/keystore/native.js'), 'utf8');
    const method = src.slice(
      src.indexOf('async isSecureHardwareAvailable()'),
      src.indexOf('// Presence check only'),
    );

    expect(method).toContain('if (!_secureHardwareAvailablePromise)');
    expect(method).toContain('detectSecureHardwareAvailable()');
    expect(method).not.toContain('BiometricAuth.checkBiometry');
  });
});
