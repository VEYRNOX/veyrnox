// src/lib/__tests__/tier.test.js
import { describe, it, expect } from 'vitest';
import {
  getCurrentTier,
  FREE_FEATURES,
  SAFETY_PLUS_FEATURES,
  AI_SECURITY_PROTECTION_FEATURES,
  hasSafetyPlusAccess,
} from '../tier';

describe('tier catalogue', () => {
  // The TIERS catalogue these three tests covered was deleted: nothing rendered
  // it, so they pinned the shape of dead data (and `expect(ai.price).toBeTruthy()`
  // passed for the wrong string it was written to catch). The live presentation
  // model is the *_FEATURES lists, covered below.

  it('getCurrentTier is a legacy display stub that always returns free (real tier comes from resolveTier)', () => {
    expect(getCurrentTier()).toBe('free');
  });

  it('FREE_FEATURES lists at least one feature with name and summary', () => {
    expect(FREE_FEATURES.length).toBeGreaterThan(0);
    for (const f of FREE_FEATURES) {
      expect(f.name, 'name').toBeTruthy();
      expect(f.summary, `${f.name} summary`).toBeTruthy();
    }
  });

  it('SAFETY_PLUS_FEATURES lists at least one feature with name and summary', () => {
    expect(SAFETY_PLUS_FEATURES.length).toBeGreaterThan(0);
    for (const f of SAFETY_PLUS_FEATURES) {
      expect(f.name, 'name').toBeTruthy();
      expect(f.summary, `${f.name} summary`).toBeTruthy();
    }
  });

  it('AI_SECURITY_PROTECTION_FEATURES lists at least one feature with name and summary', () => {
    expect(AI_SECURITY_PROTECTION_FEATURES.length).toBeGreaterThan(0);
    for (const f of AI_SECURITY_PROTECTION_FEATURES) {
      expect(f.name, 'name').toBeTruthy();
      expect(f.summary, `${f.name} summary`).toBeTruthy();
    }
  });

  it('treats ai_security_protection as having Safety Plus access', () => {
    expect(hasSafetyPlusAccess('free')).toBe(false);
    expect(hasSafetyPlusAccess('safety_plus')).toBe(true);
    expect(hasSafetyPlusAccess('ai_security_protection')).toBe(true);
  });
});
