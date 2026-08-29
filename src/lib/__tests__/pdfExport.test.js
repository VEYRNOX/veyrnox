// src/lib/__tests__/pdfExport.test.js
//
// The exported catalogue PDF mirrors the on-screen catalogue: both "verified"
// and "built" render as "Live". The underlying evidence gate in
// featureCatalogue.js is preserved (STATUS.VERIFIED still requires a real txid
// entry), but the badge no longer surfaces that distinction to users.
import { describe, it, expect } from 'vitest';
import { pdfStatusTag } from '../pdfExport';

describe('pdfStatusTag — Live vs Roadmap', () => {
  it('maps verified, built, and legacy available to [Live]', () => {
    expect(pdfStatusTag('verified')).toBe('[Live]');
    expect(pdfStatusTag('built')).toBe('[Live]');
    expect(pdfStatusTag('available')).toBe('[Live]');
  });

  it('maps roadmap to [Roadmap]', () => {
    expect(pdfStatusTag('roadmap')).toBe('[Roadmap]');
  });

  it('falls back to [Roadmap] for an unknown status', () => {
    expect(pdfStatusTag('something-else')).toBe('[Roadmap]');
  });
});
