// src/lib/__tests__/tier.test.js
import { describe, it, expect } from 'vitest';
import { getCurrentTier, TIERS, FREE_FEATURES, SAFETY_PLUS_FEATURES } from '../tier';

describe('tier catalogue', () => {
  it('is the two-tier model in order: free, safety_plus', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'safety_plus']);
  });

  it('every tier has a name, price, and tagline', () => {
    for (const t of TIERS) {
      expect(t.name, `${t.id} name`).toBeTruthy();
      expect(t.price, `${t.id} price`).toBeTruthy();
      expect(t.tagline, `${t.id} tagline`).toBeTruthy();
    }
  });

  it('Free tier is $0 and Safety Plus is $5.99/mo', () => {
    const free = TIERS.find((t) => t.id === 'free');
    const plus = TIERS.find((t) => t.id === 'safety_plus');
    expect(free.price).toBe('$0');
    expect(plus.price).toBe('$5.99/mo');
  });

  it('current tier is still the stubbed free (no billing exists)', () => {
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
});
