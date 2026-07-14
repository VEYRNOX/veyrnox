// Structural regression guard for audit finding H11 in ColdSign.jsx.
//
// H11: the cold-broadcast presignGate() was invoked with a hardcoded TIER.ALLOW,
// so the RASP plane was never evaluated at broadcast time — detect()/degrade()
// were never called. The gate always passed and could not block an unsafe runtime.
//
// We pin the wiring STRUCTURALLY (reading the page source), matching the
// established pattern in CryptoSigning.h13.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../ColdSign.jsx'), 'utf8');

describe('ColdSign — H11: cold-broadcast presignGate uses real runtime RASP detection', () => {
  it('imports useRaspArtifact and TIER from @/rasp', () => {
    expect(src).toMatch(/from\s*["']@\/rasp["']/);
    expect(src).toMatch(/useRaspArtifact/);
    expect(src).toMatch(/\bTIER\b/);
  });

  it('does not pass a hardcoded TIER.ALLOW as the first argument to presignGate', () => {
    expect(src).not.toMatch(/presignGate\(\s*TIER\.ALLOW/);
  });

  it('derives tier from raspArtifact and defaults to TIER.BLOCK if unavailable', () => {
    // useRaspArtifact() returns the degrade() artifact; .tier ?? TIER.BLOCK is the fail-closed pattern.
    expect(src).toMatch(/raspArtifact/);
    expect(src).toMatch(/TIER\.BLOCK/);
    expect(src).not.toMatch(/TIER\.ALLOW[\s\S]{0,20}TIER\.BLOCK/); // ALLOW must not be the fallback
  });

  it('still passes riskAck to presignGate (risk acknowledgement unchanged)', () => {
    expect(src).toMatch(/presignGate\([^)]*riskAck/);
  });
});
