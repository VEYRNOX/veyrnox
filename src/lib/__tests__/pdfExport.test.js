// src/lib/__tests__/pdfExport.test.js
//
// The exported catalogue PDF must render the SAME three states as the on-screen
// catalogue (features-status-schema brief §5) — not the retired two-state split.
import { describe, it, expect } from 'vitest';
import { pdfStatusTag } from '../pdfExport';

describe('pdfStatusTag — three honest states', () => {
  it('maps each state to its own tag', () => {
    expect(pdfStatusTag('verified')).toBe('[Verified]');
    expect(pdfStatusTag('built')).toBe('[Built]');
    expect(pdfStatusTag('roadmap')).toBe('[Roadmap]');
  });

  it('degrades the retired "available" string to [Built], never dropped or mislabelled verified', () => {
    expect(pdfStatusTag('available')).toBe('[Built]');
  });

  it('falls back to [Roadmap] for an unknown status', () => {
    expect(pdfStatusTag('something-else')).toBe('[Roadmap]');
  });
});
