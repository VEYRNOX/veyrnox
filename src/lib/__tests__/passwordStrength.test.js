import { describe, it, expect } from 'vitest';
import { checkVaultPasswordStrength, MIN_PASSWORD_LENGTH } from '../passwordStrength.js';

describe('checkVaultPasswordStrength', () => {
  it('accepts a reasonable 12+ char password', () => {
    expect(checkVaultPasswordStrength('correct horse battery').ok).toBe(true);
    expect(checkVaultPasswordStrength('Tr0ub4dour&3xtra').ok).toBe(true);
    expect(checkVaultPasswordStrength('Th1stle-Vortex9').ok).toBe(true);
  });

  it(`enforces the ${MIN_PASSWORD_LENGTH}-char floor at the boundary`, () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(checkVaultPasswordStrength('aB3$xQ7!kP2').ok).toBe(false);  // 11 chars
    expect(checkVaultPasswordStrength('aB3$xQ7!kP2z').ok).toBe(true);  // 12 chars
  });

  it('rejects too-short passwords with copy naming the new floor', () => {
    const r = checkVaultPasswordStrength('short');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Choose a vault password of at least 12 characters.');
  });

  it('rejects a single repeated character at/above the floor', () => {
    expect(checkVaultPasswordStrength('aaaaaaaaaaaa').ok).toBe(false);
    expect(checkVaultPasswordStrength('111111111111').ok).toBe(false);
  });

  it('rejects common passwords case-insensitively', () => {
    expect(checkVaultPasswordStrength('password1234').ok).toBe(false);
    expect(checkVaultPasswordStrength('PASSWORD1234').ok).toBe(false);
    expect(checkVaultPasswordStrength('qwerty123456').ok).toBe(false);
    expect(checkVaultPasswordStrength('passwordpassword').ok).toBe(false);
  });

  it('rejects a weak base word padded with digits/punctuation to reach the floor', () => {
    expect(checkVaultPasswordStrength('iloveyou12345').ok).toBe(false);
    expect(checkVaultPasswordStrength('monkey123456!').ok).toBe(false);
    expect(checkVaultPasswordStrength('1234letmein!!').ok).toBe(false);
  });

  it('does not flag a strong passphrase that merely ends in digits', () => {
    expect(checkVaultPasswordStrength('tangerine-bicycle-2024').ok).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(checkVaultPasswordStrength(undefined).ok).toBe(false);
    expect(checkVaultPasswordStrength(null).ok).toBe(false);
  });

  it('returns a human-readable reason on every rejection', () => {
    for (const bad of ['short', 'aaaaaaaaaaaa', 'password1234']) {
      const r = checkVaultPasswordStrength(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
