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

  // A resumed quiz must ask the SAME questions it started with. Positions used
  // to live only in component state, so every remount re-randomised them while
  // correctCount carried over — turning "resume" into a different quiz and
  // letting repeated skip/resume cycles reroll the questions.
  it('round-trips the challenged positions', () => {
    saveCheckpoint('w1', 1, 1, [2, 5, 9]);
    expect(loadCheckpoint('w1')).toEqual({
      questionIndex: 1, correctCount: 1, positions: [2, 5, 9],
    });
  });

  it('stores a copy of positions, not a live reference', () => {
    const positions = [1, 2, 3];
    saveCheckpoint('w1', 0, 0, positions);
    positions[0] = 99;
    expect(loadCheckpoint('w1').positions).toEqual([1, 2, 3]);
  });

  it('omits positions when none are supplied', () => {
    saveCheckpoint('w1', 2, 1);
    expect(loadCheckpoint('w1')).toEqual({ questionIndex: 2, correctCount: 1 });
  });

  it('keeps wallets independent', () => {
    markDeferred('w1');
    markVerified('w2');
    expect(isDeferred('w1')).toBe(true);
    expect(isVerified('w1')).toBe(false);
    expect(isVerified('w2')).toBe(true);
    expect(isDeferred('w2')).toBe(false);
  });

  // The whole point of the single-blob layout: the number of localStorage keys
  // must not grow with the number of wallets, or a storage dump becomes a
  // wallet count. This previously wrote one key per wallet per flag.
  it('never lets the key count reveal how many wallets exist', () => {
    markDeferred('w1');
    saveCheckpoint('w1', 1, 1);
    const afterOne = localStorage.length;

    for (const id of ['w2', 'w3', 'w4', 'w5', 'w6']) {
      markDeferred(id);
      saveCheckpoint(id, 2, 2);
    }

    expect(localStorage.length).toBe(afterOne);
    expect(localStorage.length).toBe(1);
  });

  it('removes its key entirely once no wallet has state', () => {
    markDeferred('w1');
    expect(localStorage.length).toBe(1);
    markVerified('w1');
    clearCheckpoint('w1');
    // 'verified' is still meaningful, so the key remains — but clearing that
    // last wallet's entry must leave nothing behind.
    localStorage.clear();
    saveCheckpoint('w9', 0, 0);
    clearCheckpoint('w9');
    expect(localStorage.getItem('veyrnox-seed-verify')).toBe(null);
  });
});
