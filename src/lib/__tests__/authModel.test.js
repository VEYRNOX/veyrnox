import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAuthModel, setAuthModel, isPinModel, shouldCacheUnlockSecret,
} from '../authModel.js';

describe('authModel — cohort marker', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the password cohort when unset', () => {
    expect(getAuthModel()).toBe('password');
    expect(isPinModel()).toBe(false);
  });

  it('persists and reads back the pin cohort', () => {
    setAuthModel('pin');
    expect(getAuthModel()).toBe('pin');
    expect(isPinModel()).toBe(true);
  });

  it('setAuthModel throws on an unknown model (fail fast on misclassification)', () => {
    expect(() => setAuthModel('magic')).toThrow(/Unknown auth model/);
  });
});

describe('shouldCacheUnlockSecret — never re-cache the real PIN (§2/§11)', () => {
  it('password cohort with biometric on: re-cache allowed', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'password', biometricEnabled: true })).toBe(true);
  });

  it('PIN cohort: NEVER re-cache (the changed secret is the real PIN)', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'pin', biometricEnabled: true })).toBe(false);
  });

  it('biometric off: never re-cache regardless of cohort', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'password', biometricEnabled: false })).toBe(false);
    expect(shouldCacheUnlockSecret({ authModel: 'pin', biometricEnabled: false })).toBe(false);
  });
});
