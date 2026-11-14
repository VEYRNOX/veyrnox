import { describe, expect, it } from 'vitest';
import {
  beginWipe,
  capturePendingWorkGen,
  invalidatePendingWork,
  isPendingWorkCurrent,
} from '../wipeEpoch.js';

describe('pending-work generation', () => {
  it('stays current until something invalidates it', () => {
    const gen = capturePendingWorkGen();
    expect(isPendingWorkCurrent(gen)).toBe(true);
  });
  it('is invalidated by a wipe', async () => {
    const gen = capturePendingWorkGen();
    await beginWipe();
    expect(isPendingWorkCurrent(gen)).toBe(false);
  });
  it('is invalidated by a lock', () => {
    const gen = capturePendingWorkGen();
    invalidatePendingWork();
    expect(isPendingWorkCurrent(gen)).toBe(false);
  });
});
