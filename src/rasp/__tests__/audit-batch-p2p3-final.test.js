// Audit batch — P2-9 (hook-order under BYPASS_RASP), P3-2/P3-5 (doc-lag phrases).
//
// Structural pins (source-string greps) on invariants the audit cycle nailed
// down. Behaviour where possible, source-string where the guarantee is
// architectural (rules of hooks; header honesty).
//
// I3/I4: pure test file, no wallet-set handle, no egress, no key access.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, '../useRaspArtifact.js'), 'utf8');
const indexSrc = readFileSync(join(here, '../index.js'), 'utf8');

// ── P2-9 — rules-of-hooks: BYPASS_RASP early-return must sit BELOW hook calls ─
//
// Prior shape (post-#1013): `if (BYPASS_RASP) return …` sat ABOVE useState/useEffect,
// masked by @ts-nocheck. Runtime-stable today because BYPASS_RASP is a
// module-load constant, but a future author reactifying the flag turns it into a
// real hook-order bug. Guard the ordering architecturally.
describe('P2-9 — useRaspArtifact does not conditionally skip hooks under BYPASS_RASP', () => {
  it('the earliest useState call precedes the BYPASS_RASP early return', () => {
    const firstUseState = hookSrc.indexOf('useState(');
    const bypassReturn = hookSrc.search(/if\s*\(\s*BYPASS_RASP\s*\)\s*return/);
    expect(firstUseState).toBeGreaterThan(-1);
    expect(bypassReturn).toBeGreaterThan(-1);
    expect(firstUseState).toBeLessThan(bypassReturn);
  });

  it('the earliest useEffect call precedes the BYPASS_RASP early return', () => {
    const firstUseEffect = hookSrc.indexOf('useEffect(');
    const bypassReturn = hookSrc.search(/if\s*\(\s*BYPASS_RASP\s*\)\s*return/);
    expect(firstUseEffect).toBeGreaterThan(-1);
    expect(bypassReturn).toBeGreaterThan(-1);
    expect(firstUseEffect).toBeLessThan(bypassReturn);
  });
});

// ── P3-2 — doc-lag: JWS RS256 IS verified on-device now (PR #943 / #955 / #1009) ─
describe('P3-2 — attestation JWS-verification docs reflect PR #943/#955/#1009', () => {
  it('useRaspArtifact.js does not still claim "JWS RS256 not verified on-device"', () => {
    expect(hookSrc).not.toMatch(/JWS RS256 not verified on-device/i);
  });

  it('rasp/index.js does not still claim "Android JWS is not on-device signature-verified"', () => {
    expect(indexSrc).not.toMatch(/JWS is not on-device signature-verified/i);
  });
});

// ── P3-5 — useRaspArtifact.js header lists the actual live consumer set ─────
describe('P3-5 — useRaspArtifact header reflects the true consumer set', () => {
  it('does not still describe consumers as only the send flow (seed-reveal/export/import)', () => {
    // Old wording — "callsites outside the send flow (seed-reveal, export, import)"
    // — reads aspirational vs. the current 8+ live consumers. Reject if unchanged.
    expect(hookSrc).not.toMatch(/callsites outside the send flow \(seed-reveal, export, import\)/);
  });
});
