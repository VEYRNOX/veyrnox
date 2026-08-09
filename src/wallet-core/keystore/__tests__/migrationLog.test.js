// src/wallet-core/keystore/__tests__/migrationLog.test.js
//
// LOG-1 contract for the AAD v:3 migration reporter. The handler's contract is
// pinned by a direct unit test, mirroring the discipline already applied to
// native.js's logM2cMigrationFailure.
//
// The rule: the ONLY strings that may reach the console are (a) an entry from
// the code allowlist, (b) an allowlisted platform constructor name, or
// (c) the fixed literal 'unknown error'. Never the error's own message, never
// the blob, never ciphertext or key material.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeAadV3Detail, logAadV3MigrationFailure } from '../migrationLog.js';

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe('safeAadV3Detail — allowlist', () => {
  it('returns the code when `.code` is allowlisted', () => {
    expect(safeAadV3Detail(Object.assign(new Error('x'), { code: 'VAULT_MALFORMED' }))).toBe('VAULT_MALFORMED');
    expect(safeAadV3Detail(Object.assign(new Error('x'), { code: 'MALFORMED_VAULT' }))).toBe('MALFORMED_VAULT');
  });

  it('matches on `.message` too — safeWriteVault throws a bare Error with no code', () => {
    expect(safeAadV3Detail(new Error('VAULT_WRITE_VERIFY_FAILED'))).toBe('VAULT_WRITE_VERIFY_FAILED');
  });

  it('NEVER returns the error message when it is not itself an allowlist entry', () => {
    const leaky = new Error('seed=abandon abandon abandon ct=AAAA kekWrap={"ct":"…"}');
    const out = safeAadV3Detail(leaky);
    expect(out).toBe('Error (unknown code)');
    expect(out).not.toContain('seed');
    expect(out).not.toContain('abandon');
    expect(out).not.toContain('kekWrap');
  });

  it('allowlists the CONSTRUCTOR NAME — a crafted name cannot reach the console (Codex P3)', () => {
    // `constructor.name` is attacker-reachable on a crafted throw. Before the
    // fix this returned "<caller text> (unknown code)", putting arbitrary text
    // on the console and breaking this module's own stated contract.
    const crafted = { constructor: { name: 'ct=AAAAB3NzaC1 seed=abandon abandon' } };
    expect(safeAadV3Detail(crafted)).toBe('unknown error');
  });

  it('degrades to a fixed literal for primitives, null, and plain objects', () => {
    expect(safeAadV3Detail(null)).toBe('unknown error');
    expect(safeAadV3Detail(undefined)).toBe('unknown error');
    expect(safeAadV3Detail('a raw string with a secret in it')).toBe('unknown error');
    expect(safeAadV3Detail({ ct: 'secret' })).toBe('unknown error');
  });
});

describe('logAadV3MigrationFailure', () => {
  it('emits the prefix plus the sanitised detail as SEPARATE args, never the error object', () => {
    const e = Object.assign(new Error('VAULT_MALFORMED'), { code: 'VAULT_MALFORMED', ct: 'SECRET_CIPHERTEXT' });
    logAadV3MigrationFailure(e);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const [prefix, detail, ...rest] = errSpy.mock.calls[0];
    expect(prefix).toBe('[keystore] AAD v:3 migration failed:');
    expect(detail).toBe('VAULT_MALFORMED');
    expect(rest, 'no extra args — the error object must never be passed').toHaveLength(0);
    // Belt and braces: nothing logged may contain the attached ciphertext.
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('SECRET_CIPHERTEXT');
  });

  it('never throws, even if console.error itself throws', () => {
    errSpy.mockImplementation(() => { throw new Error('console is broken'); });
    // A logger fault must not escalate into a failed unlock (I4).
    expect(() => logAadV3MigrationFailure(new Error('boom'))).not.toThrow();
  });
});
