// kek.honesty-wider.test.js — source-scan honesty guard (H14/H15 wider sweep).
//
// Pins that 6 more files do NOT overclaim Secure Enclave / StrongBox /
// "hardware-backed" key-wrap of the vault key. The technical truth:
//   - iOS KEK uses kSecClassGenericPassword Keychain (whenPasscodeSetThisDeviceOnly),
//     NOT Secure Enclave.
//   - Android KEK does not call setIsStrongBoxBacked(true) — may land in TEE or SW.
//   - No Enclave/StrongBox key wraps the vault key.
//
// These assert on SOURCE STRINGS (the I4 honesty contract), not runtime behaviour.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('H14/H15 wider — no SE/hardware-backed overclaims', () => {
  it('featureCatalogue.js does not claim "Secure Enclave / Android Keystore hardening"', () => {
    const src = read('src/lib/featureCatalogue.js');
    expect(src).not.toContain('Secure Enclave / Android Keystore hardening');
  });

  it('Documentation.jsx does not claim "Secure Enclave / Android Keystore hardening"', () => {
    const src = read('src/pages/Documentation.jsx');
    expect(src).not.toContain('Secure Enclave / Android Keystore hardening');
  });

  it('StealthWallets.jsx does not call the primary vault "hardware-backed"', () => {
    const src = read('src/pages/StealthWallets.jsx');
    // No "hardware-backed" anywhere near the "primary vault" claim.
    const idx = src.indexOf('primary vault');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(window).not.toContain('hardware-backed');
  });

  it('native.js does not claim "Secure Enclave-wrapped Keychain"', () => {
    const src = read('src/wallet-core/keystore/native.js');
    expect(src).not.toContain('Secure Enclave-wrapped Keychain');
  });

  it('keyStore.js isSecureHardwareAvailable JSDoc carries an honest caveat', () => {
    const src = read('src/wallet-core/keystore/keyStore.js');
    const idx = src.indexOf('isSecureHardwareAvailable');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 400);
    expect(window.includes('NOTE:') || window.includes('does NOT probe')).toBe(true);
  });

  it('biometricUnlock.js does not use bare "hardware-backed" without a platform-store qualifier', () => {
    const src = read('src/lib/biometricUnlock.js');
    expect(src).not.toContain('hardware-backed');
  });
});
