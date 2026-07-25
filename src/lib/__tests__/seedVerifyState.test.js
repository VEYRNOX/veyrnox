import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCheckpoint, loadCheckpoint, clearCheckpoint,
  markVerified, isVerified, markDeferred, isDeferred,
} from '@/lib/seedVerifyState';

describe('seedVerifyState', () => {
  beforeEach(() => localStorage.clear());

  it('returns null checkpoint when none saved', () => {
    expect(loadCheckpoint('w1')).toBe(null);
  });

  it('saves and loads checkpoint', () => {
    saveCheckpoint('w1', 2, 1);
    expect(loadCheckpoint('w1')).toEqual({ questionIndex: 2, correctCount: 1 });
  });

  it('clears checkpoint', () => {
    saveCheckpoint('w1', 2, 1);
    clearCheckpoint('w1');
    expect(loadCheckpoint('w1')).toBe(null);
  });

  it('marks verified', () => {
    expect(isVerified('w1')).toBe(false);
    markVerified('w1');
    expect(isVerified('w1')).toBe(true);
  });

  it('marks deferred', () => {
    expect(isDeferred('w1')).toBe(false);
    markDeferred('w1');
    expect(isDeferred('w1')).toBe(true);
  });

  it('verified clears deferred', () => {
    markDeferred('w1');
    markVerified('w1');
    expect(isDeferred('w1')).toBe(false);
    expect(isVerified('w1')).toBe(true);
  });
});
