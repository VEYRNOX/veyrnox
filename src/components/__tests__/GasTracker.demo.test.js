// src/components/__tests__/GasTracker.demo.test.js
//
// DEMO egress suppression (source scan, mirroring CryptoNewsFeed.deniability.test.js
// and useReceiveDetector.test.js).
//
// GasTracker polls 3 external services (mempool.space, api.etherscan.io,
// api.devnet.solana.com) on mount and on a 30 s refetchInterval. The existing
// I3 guard (VULN-15) only covers decoy/hidden sessions — isDecoy/isHidden are
// both false in an ordinary demo tour (veyrnox-demo=1, no unlocked vault), so
// the query runs for real and fires live network egress during a demo. That is
// an M-6 class leak (the same fix landed in src/notify/useReceiveDetector.js).
//
// Fix: import DEMO from @/api/demoClient and fold it into the enabled/refetch
// gate so a demo tour makes ZERO real backend calls. The component already
// renders a network-silent state when the query is disabled (built for
// decoy/hidden); demo reuses it — NO mock/fake fee data is added.
//
// These are structural source-scan tests (no React render harness exists in
// this project — the house style is readFileSync + comment-strip + assert).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../GasTracker.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('GasTracker — DEMO egress suppression structural guards (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    // Module-load-time constant boolean — the canonical M-6 suppression source.
    expect(code).toMatch(/import\s*\{[^}]*\bDEMO\b[^}]*\}\s*from\s*["']@\/api\/demoClient["']/);
  });

  it('folds !DEMO (or DEMO) into the egress gate', () => {
    // The enabled/refetch gate must reference DEMO so a demo tour disables the
    // query. Accept either `&& !DEMO` or a DEMO term in the gating expression.
    expect(code).toMatch(/!DEMO/);
  });

  it('the useQuery enabled flag is gated on the DEMO-aware expression', () => {
    // enabled: must not be a bare `i3Active` — the egress-allowed gate that
    // feeds `enabled:` must incorporate DEMO.
    const egressGate = /const\s+egressAllowed\s*=\s*i3Active\s*&&\s*!DEMO/;
    expect(code).toMatch(egressGate);
    // Both enabled: and the refetchInterval ternary use the DEMO-aware gate.
    expect(code).toMatch(/enabled\s*:\s*egressAllowed/);
    expect(code).toMatch(/refetchInterval\s*:\s*egressAllowed\s*\?/);
  });

  it('the DEMO gate definition precedes the fetchFees query definition', () => {
    // Ordering: the egress gate must be established before the query wiring
    // that consumes it (and before the fetch-defining queryFn reference).
    const gateIdx = code.search(/!DEMO/);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(code.indexOf('queryFn: fetchFees'));
    expect(gateIdx).toBeLessThan(code.indexOf('enabled:'));
  });

  it('regression: the I3 decoy/hidden guard is still present', () => {
    // The DEMO fix must ADD to, not replace, the VULN-15 I3 guard.
    expect(code).toMatch(/!isDecoy\s*&&\s*!isHidden/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('honesty: no mock/fake fee data is introduced for the demo path', () => {
    // Suppression must be network-silence, not fabricated numbers. Guard against
    // an accidental hardcoded demo fee object sneaking in.
    expect(code).not.toMatch(/demoFees|fakeFees|mockFees|DEMO_FEES/i);
  });
});
