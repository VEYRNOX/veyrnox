// Issue #725 (M-3): the M2c up-migration catch in native.js unlock() must remain
// NON-FATAL (unlock still returns the secret) but must NOT silently swallow the
// failure — it has to log the error's code/message so a persistent
// VAULT_WRITE_VERIFY_FAILED is visible. It must log ONLY code/message, NEVER the
// vault blob or any key material (LOG-1).
//
// The catch-handler is extracted into a small pure helper we can exercise
// directly. This pins the contract of that handler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal @capacitor/core mock so native.js imports cleanly (it lazy-imports the
// enclave plugin, so registerPlugin is never touched here).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => ({}),
}));

import { logM2cMigrationFailure } from '../native.js';

describe('#725 M-3: logM2cMigrationFailure (M2c up-migration is non-fatal but logged)', () => {
  let errSpy;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('logs the VAULT_WRITE_VERIFY_FAILED code (not swallowed silently)', () => {
    const e = Object.assign(new Error('write verify mismatch'), {
      code: 'VAULT_WRITE_VERIFY_FAILED',
    });
    logM2cMigrationFailure(e);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const args = errSpy.mock.calls[0];
    expect(args[0]).toContain('M2c up-migration failed');
    expect(args).toContain('VAULT_WRITE_VERIFY_FAILED');
  });

  // Codex 2026-07-17 P2-#3 (allowlist tightening): logM2cMigrationFailure no longer
  // falls back to e.message (a future error class throwing a secret-bearing message
  // would leak into the log). Instead: allowlisted code → log code; else known
  // constructor → log "<Name> (unknown code)"; else → "unknown error". e.message is
  // NEVER logged.
  it('logs the constructor name (not e.message) when code is absent', () => {
    logM2cMigrationFailure(new Error('boom without code'));
    expect(errSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).not.toContain('boom without code');
    expect(serialized).toContain('Error');
    expect(serialized).toContain('unknown code');
  });

  it('logs "unknown code" (and constructor name) for an unknown code — NEVER e.message', () => {
    const e = Object.assign(new Error('secret-shaped message that must not leak'), {
      code: 'SOME_UNRECOGNISED_CODE',
    });
    logM2cMigrationFailure(e);
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).not.toContain('SOME_UNRECOGNISED_CODE');
    expect(serialized).not.toContain('secret-shaped message that must not leak');
    expect(serialized).toContain('unknown code');
  });

  it('does NOT leak a secret-shaped message when code is absent', () => {
    const e = new Error('seed=abandon abandon abandon abandon abandon abandon');
    logM2cMigrationFailure(e);
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).not.toContain('abandon');
    expect(serialized).not.toContain('seed=');
  });

  it('logs "unknown error" for a primitive string throw', () => {
    logM2cMigrationFailure('a bare string with a possible secret');
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).not.toContain('a bare string with a possible secret');
    expect(serialized).toContain('unknown error');
  });

  it('never logs vault-blob / key material (only code or message)', () => {
    // An error object that also carries secret-looking fields must not leak them.
    const e = Object.assign(new Error('write verify mismatch'), {
      code: 'VAULT_WRITE_VERIFY_FAILED',
      hw: 'BASE64_CIPHERTEXT_SHOULD_NEVER_BE_LOGGED',
      kekWrap: 'SECRET_KEK_WRAP',
      ct: 'SEED_CIPHERTEXT',
    });
    logM2cMigrationFailure(e);
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).not.toContain('BASE64_CIPHERTEXT_SHOULD_NEVER_BE_LOGGED');
    expect(serialized).not.toContain('SECRET_KEK_WRAP');
    expect(serialized).not.toContain('SEED_CIPHERTEXT');
    // The whole error object must not be passed through (only primitives).
    for (const arg of errSpy.mock.calls[0]) {
      expect(typeof arg === 'string' || arg == null).toBe(true);
    }
  });

  it('does not throw on a null/undefined error (stays non-fatal)', () => {
    expect(() => logM2cMigrationFailure(undefined)).not.toThrow();
    expect(() => logM2cMigrationFailure(null)).not.toThrow();
  });

  it('logs "unknown error" for null / undefined (no constructor to name)', () => {
    logM2cMigrationFailure(null);
    logM2cMigrationFailure(undefined);
    const serialized = JSON.stringify(errSpy.mock.calls);
    expect(serialized).toContain('unknown error');
  });
});
