// src/lib/__tests__/tier.test.js
import { describe, it, expect } from 'vitest';
import {
  getCurrentTier,
  TIERS,
  FREE_FEATURES,
  SAFETY_PLUS_FEATURES,
  AI_SECURITY_PROTECTION_FEATURES,
  hasSafetyPlusAccess,
} from '../tier';

describe('tier catalogue', () => {
  it('is the three-tier model in order: free, safety_plus, ai_security_protection', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'safety_plus', 'ai_security_protection']);
  });

  it('every tier has a name, price, and tagline', () => {
    for (const t of TIERS) {
      expect(t.name, `${t.id} name`).toBeTruthy();
      expect(t.tagline, `${t.id} tagline`).toBeTruthy();
    }
  });

  it('Free tier is $0, Safety Plus is $5.99/mo, and AI Security Protection stays separately listed without a direct price string', () => {
    const free = TIERS.find((t) => t.id === 'free');
    const plus = TIERS.find((t) => t.id === 'safety_plus');
    const ai = TIERS.find((t) => t.id === 'ai_security_protection');
    expect(free.price).toBe('$0');
    expect(plus.price).toBe('$5.99/mo');
    expect(ai.price).toBe('');
  });

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
