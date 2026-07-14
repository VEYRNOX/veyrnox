import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// SUPERSEDED: this file used to assert the source carried a 'VULN-17 ACCEPTED RESIDUAL'
// marker documenting that the primary-success path was DELIBERATELY left ~3 KDFs faster
// than any other outcome. That residual (the H-1 unlock-timing oracle) is now CLOSED
// structurally by spendPrimaryUnlockEqualizerKdfs — every outcome spends an identical
// KDF count. So the doc-marker to pin is the CLOSURE, not the accepted-residual note.
describe('deniabilityUnlock H-1 (ex VULN-17) — closed structurally, documented in source', () => {
  const src = readFileSync(resolve(__dirname, '../deniabilityUnlock.js'), 'utf-8');

  it('documents the H-1 closure and exports the structural equalizer', () => {
    // The equalizer helper must exist and be referenced by the closure note.
    expect(src).toContain('spendPrimaryUnlockEqualizerKdfs');
    expect(src).toContain('NOW CLOSED STRUCTURALLY');
  });

  it('no longer presents the timing gap as an ACCEPTED (open) residual', () => {
    // The old marker survives ONLY inside the "formerly … NOW CLOSED" closure sentence;
    // it must never reappear as a standalone accepted-residual claim. Assert the closure
    // framing is present wherever the historical phrase is mentioned.
    if (src.includes('VULN-17 ACCEPTED RESIDUAL')) {
      expect(src).toContain('formerly VULN-17 ACCEPTED RESIDUAL, NOW CLOSED');
    }
  });
});
