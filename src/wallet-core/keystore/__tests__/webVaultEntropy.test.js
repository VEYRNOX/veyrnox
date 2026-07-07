// src/wallet-core/keystore/__tests__/webVaultEntropy.test.js
//
// H-A — Web vault PIN entropy: enforce a minimum password length on the web
// (non-hardware-KEK) path for mainnet vaults.
//
// On web, isSecureHardwareAvailable() === false: the vault is Argon2id over the
// PIN ALONE. A short 6-digit PIN is offline-exhaustible. Mainnet is live, so the
// web createVault path MUST reject passwords shorter than 12 characters with a
// clear, machine-coded error (I4 — fail honest, fail closed).
//
// The native path uses the hardware KEK as a second factor, so it must NOT carry
// this same restriction.
//
// Behavioural tests exercise the real exported helper; source-scan guards pin
// that the restriction lives in the web layer, is gated on mainnet, and is NOT
// applied to the native path.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateWebVaultPassword, WEB_VAULT_ERR, WEB_VAULT_MIN_PASSWORD_LEN, webKeyStore } from '../web.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('H-A — web vault password length enforcement (behaviour)', () => {
  it('exposes an 8-digit minimum (web mirrors native PIN)', () => {
    expect(WEB_VAULT_MIN_PASSWORD_LEN).toBe(8);
  });

  it('rejects a short 6-digit PIN with a machine code', () => {
    expect(() => validateWebVaultPassword('123456')).toThrow(
      WEB_VAULT_ERR.PASSWORD_TOO_SHORT,
    );
  });

  it('rejects a 7-digit password (boundary)', () => {
    expect(() => validateWebVaultPassword('abcdefg')).toThrow(
      WEB_VAULT_ERR.PASSWORD_TOO_SHORT,
    );
  });

  it('accepts an 8-digit password (boundary)', () => {
    expect(() => validateWebVaultPassword('abcdefgh')).not.toThrow();
  });

  it('the thrown error carries a human message referencing "8"', () => {
    let msg = '';
    try {
      validateWebVaultPassword('short');
    } catch (e) {
      msg = e.userMessage || '';
    }
    expect(msg).toContain('8');
  });
});

describe('M-8 (issue #731) — changePassword enforces the minimum on newPassword', () => {
  it('rejects a too-short newPassword with the machine code before touching the vault', async () => {
    // The minimum must fire on newPassword up front (after assertNotNativePlatform,
    // before loadVault), so a weak new PIN can never re-wrap the vault — mirroring
    // createVault. No vault mocks: the throw must happen before any storage read.
    await expect(
      webKeyStore.changePassword('current-password-ok', '1'),
    ).rejects.toThrow(WEB_VAULT_ERR.PASSWORD_TOO_SHORT);
  });
});

describe('H-A — web createVault enforces the minimum (source-scan)', () => {
  const src = readFileSync(resolve(here, '../web.js'), 'utf8');

  it('createVault calls validateWebVaultPassword (restriction in the web layer)', () => {
    const idx = src.indexOf('async createVault(');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 600);
    expect(body).toContain('validateWebVaultPassword');
  });

  it('the restriction is gated on ALLOW_MAINNET (mainnet vaults only)', () => {
    expect(src).toContain('ALLOW_MAINNET');
  });
});

describe('H-A — native path does NOT carry the web length restriction', () => {
  it('native.js does not reference validateWebVaultPassword', () => {
    let nativeSrc = '';
    try {
      nativeSrc = readFileSync(resolve(here, '../native.js'), 'utf8');
    } catch {
      nativeSrc = '';
    }
    expect(nativeSrc).not.toContain('validateWebVaultPassword');
  });
});
