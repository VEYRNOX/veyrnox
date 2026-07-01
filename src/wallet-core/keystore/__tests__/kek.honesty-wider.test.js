// kek.honesty-wider.test.js — source-scan honesty guard (H14/H15 wider sweep).
//
// Pins that 6 more files do NOT overclaim the hardware protection to USERS — in
// particular they must not present the vault key as directly "Secure Enclave /
// StrongBox / hardware-backed" wrapped when it is not. The technical truth (corrected
// per the ECC Hardware KEK audit L5 — the earlier note here described a superseded iOS
// model and is fixed below):
//   - iOS KEK (HardwareKekPlugin.m): the hardware factor H is ECIES-wrapped under a
//     NON-EXTRACTABLE Secure Enclave P-256 key; only the ECIES *ciphertext* of H is
//     stored in the generic Keychain (kSecClassGenericPassword). So iOS H IS bound to
//     the Secure Enclave — but the Enclave key wraps H, it does NOT directly wrap the
//     vault key (H feeds the KEK; the KEK wraps the DEK; the DEK encrypts the vault).
//   - Android KEK: StrongBox is preferred but NOT enforced — the AndroidKeyStore key may
//     land in TEE (or be refused if it lands in SOFTWARE). No StrongBox guarantee.
//   - Therefore no Enclave/StrongBox key DIRECTLY wraps the vault key, and any user-
//     facing "Secure Enclave / Android Keystore hardening" of the vault key would
//     overclaim — which is what these assertions still forbid.
//
// These assert on SOURCE STRINGS (the I4 honesty contract), not runtime behaviour, and
// remain a genuine guard against user-facing overclaim.

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
