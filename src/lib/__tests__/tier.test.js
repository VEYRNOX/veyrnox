// src/lib/__tests__/tier.test.js
import { describe, it, expect } from 'vitest';
import { getCurrentTier, TIERS, PRO_FEATURES } from '../tier';

describe('tier catalogue', () => {
  it('is the four-tier two-axis model in order: free, pro, shield, guardian', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'pro', 'shield', 'guardian']);
  });

  it('every tier has a name, price, and tagline', () => {
    for (const t of TIERS) {
      expect(t.name, `${t.id} name`).toBeTruthy();
      expect(t.price, `${t.id} price`).toBeTruthy();
      expect(t.tagline, `${t.id} tagline`).toBeTruthy();
    }
  });

  it('current tier is still the stubbed free (no billing exists)', () => {
    expect(getCurrentTier()).toBe('free');
  });

  it('honesty rule: Pro lists ONLY already-built features', () => {
    expect(PRO_FEATURES.length).toBeGreaterThan(0);
    for (const f of PRO_FEATURES) {
      expect(f.status, `${f.name} status`).toBe('available');
    }
  });
});
