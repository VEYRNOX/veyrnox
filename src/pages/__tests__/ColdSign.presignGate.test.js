// ColdSign.presignGate.test.js
//
// TDD guard for H11 audit finding: ColdSign.jsx must call detect() at broadcast
// time and pass the live RASP tier to presignGate — not hardcode TIER.ALLOW.
//
// These tests confirm the structural wiring in source, not runtime DOM behaviour.
// Source-level assertions are the codebase pattern for single-moving-part wiring
// guards (see SendCrypto.confirmation.test.js for precedent).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../ColdSign.jsx'), 'utf8');

describe('ColdSign — H11: live RASP probe at broadcast (not hardcoded ALLOW)', () => {
  it('imports detect and degrade from @/rasp', () => {
    // Must import the live probe helpers, not just TIER
    expect(src).toMatch(/import\s*\{[^}]*\bdetect\b[^}]*\}\s*from\s*["']@\/rasp["']/);
    expect(src).toMatch(/import\s*\{[^}]*\bdegrade\b[^}]*\}\s*from\s*["']@\/rasp["']/);
  });

  it('imports browserProbeSource from @/rasp', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bbrowserProbeSource\b[^}]*\}\s*from\s*["']@\/rasp["']/);
  });

  it('calls detect(browserProbeSource) inside handleBroadcast', () => {
    // The live call must appear in source — not just be imported
    expect(src).toContain('detect(browserProbeSource)');
  });

  it('wraps detect in degrade()', () => {
    expect(src).toContain('degrade(detect(browserProbeSource))');
  });

  it('does NOT hardcode TIER.ALLOW as the first argument to presignGate', () => {
    // Old placeholder: presignGate(TIER.ALLOW, "allow", riskAck)
    // After fix: presignGate(raspTier, "allow", riskAck)
    expect(src).not.toContain('presignGate(TIER.ALLOW,');
  });

  it('passes raspTier (not a literal) to presignGate', () => {
    expect(src).toMatch(/presignGate\s*\(\s*raspTier\s*,/);
  });

  it('no longer carries the STRUCTURAL PLACEHOLDER comment', () => {
    expect(src).not.toContain('STRUCTURAL PLACEHOLDER ONLY');
  });
});
