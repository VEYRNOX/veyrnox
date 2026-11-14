import { describe, expect, it } from 'vitest';
import { FEATURE_CATEGORIES, STATUS } from '../featureCatalogue.js';

describe('Additional Tokens catalogue honesty', () => {
  it('is BUILT, never verified, and states its read-only/device-verification limits', () => {
    const feature = FEATURE_CATEGORIES
      .flatMap((category) => category.features)
      .find((item) => item.name === 'Additional Tokens');
    expect(feature?.status).toBe(STATUS.BUILT);
    expect(feature?.status).not.toBe(STATUS.VERIFIED);
    expect(feature?.explanation).toMatch(/display-only/i);
    expect(feature?.explanation).toMatch(/not device-verified/i);
  });
});
