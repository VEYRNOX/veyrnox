// src/pages/__tests__/SendCrypto.tipGate.test.js
//
// Audit 2026-08-03 H-1 / L-4 — the send gate must wait for TIP remote screening.
//
// Structural pins on the source text, matching the house pattern for this page
// (see SendCrypto.raspFreshAtSign.test.js). The behavioural rule lives in
// src/lib/__tests__/riskGateReady.test.js — this file pins that SendCrypto
// actually uses it, and uses it with BOTH contributors.
//
// What went wrong originally is worth pinning precisely: readiness was written
// as a separate expression from the queries' `enabled` props, so the two drifted
// — the gate waited on a query that never ran for BTC/SOL (L-4) and failed to
// wait on the one that did (H-1). The fix is a single declaration per
// contributor, read by both places.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — the risk gate waits for remote screening (H-1)', () => {
  it('uses the shared readiness helper rather than an ad-hoc expression', () => {
    expect(src).toMatch(/import\s*\{\s*isRiskGateReady\s*\}\s*from\s*["']@\/lib\/riskGateReady["']/);
    expect(src).toMatch(/const\s+riskReady\s*=\s*isRiskGateReady\s*\(/);
  });

  it('no longer derives readiness from txSim alone', () => {
    // The exact defective expression, and the shape of it.
    expect(src).not.toMatch(/riskReady\s*=\s*DEMO\s*\|\|\s*!!txSim\.data/);
  });

  it('feeds BOTH the simulation and the TIP query into the gate', () => {
    const call = src.slice(
      src.indexOf('const riskReady = isRiskGateReady('),
      src.indexOf('const riskReady = isRiskGateReady(') + 400,
    );
    expect(call).toMatch(/applies:\s*txSimApplies\s*,\s*query:\s*txSim/);
    expect(call).toMatch(/applies:\s*tipScreenApplies\s*,\s*query:\s*tipQuery/);
  });

  it('drives each query\'s `enabled` from the same constant the gate reads', () => {
    // The anti-drift property. If someone inlines an `enabled:` expression again,
    // the gate and the query can disagree — which is the original bug.
    expect(src).toMatch(/const\s+tipScreenApplies\s*=/);
    expect(src).toMatch(/const\s+txSimApplies\s*=/);
    expect(src).toMatch(/enabled:\s*tipScreenApplies\s*,/);
    expect(src).toMatch(/enabled:\s*txSimApplies\s*,/);
  });

  it('re-asserts screening completion at the signing chokepoint, not just in the UI', () => {
    // Button state is not the security boundary: scoreCurrentSend() reads
    // tipQuery.data via closure at sign time too.
    expect(src).toMatch(/TIP_SCREEN_PENDING/);
    const idx = src.indexOf('TIP_SCREEN_PENDING');
    const region = src.slice(Math.max(0, idx - 600), idx);
    expect(region).toMatch(/tipScreenApplies\s*&&\s*!\(\s*tipQuery\.isSuccess\s*\|\|\s*tipQuery\.isError\s*\)/);
  });

  it('the chokepoint assert precedes the risk scoring it protects', () => {
    const assertIdx = src.indexOf('TIP_SCREEN_PENDING');
    const scoreIdx = src.indexOf('const freshScore = scoreCurrentSend()');
    expect(assertIdx).toBeGreaterThan(-1);
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(scoreIdx);
  });

  it('does not gate readiness on the TIP payload being truthy', () => {
    // screenTransaction() resolves to null when TIP is unconfigured — every
    // build today. `!!tipQuery.data` would block every screened send forever.
    expect(src).not.toMatch(/!!\s*tipQuery\.data/);
  });
});
