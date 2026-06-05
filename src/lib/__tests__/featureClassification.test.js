// src/lib/__tests__/featureClassification.test.js
import { describe, it, expect } from 'vitest';
import { ALL_ROUTE_PATHS, CLASSIFICATION } from '../featureClassification';

const VERDICTS = ['live', 'disabled', 'cut'];

describe('classification completeness', () => {
  // SKIPPED until the sweep (Tasks 3-10) classifies every route; Task 11 un-skips.
  it.skip('assigns a deliberate verdict to EVERY route (no route left unclassified)', () => {
    const missing = ALL_ROUTE_PATHS.filter((p) => !CLASSIFICATION[p]);
    expect(missing).toEqual([]);
  });

  it('classifies no path that is not a real route', () => {
    const extra = Object.keys(CLASSIFICATION).filter((p) => !ALL_ROUTE_PATHS.includes(p));
    expect(extra).toEqual([]);
  });

  it('every entry has a valid verdict and a non-empty note', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      expect(VERDICTS, `${path} verdict`).toContain(entry.verdict);
      expect(typeof entry.note, `${path} note`).toBe('string');
      expect(entry.note.length, `${path} note`).toBeGreaterThan(0);
    }
  });

  it('every disabled entry carries a reason (leaks|server|unverified)', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'disabled') {
        expect(['leaks', 'server', 'unverified'], `${path} reason`).toContain(entry.reason);
      }
    }
  });
});
