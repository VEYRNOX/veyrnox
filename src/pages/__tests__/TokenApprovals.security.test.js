import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../TokenApprovals.jsx'), 'utf8');

describe('TokenApprovals — revoke path security gates', () => {
  it('routes revokes through action guard and fresh local RASP', () => {
    expect(src).toMatch(/useActionGuard/);
    expect(src).toMatch(/useRaspArtifact\(\{ excludeAttestation: true \}\)/);
    expect(src).toMatch(/await\s+getFreshLocalRaspArtifact\s*\(\s*\)/);
    expect(src).toMatch(/sensitiveGate\(freshArtifact,\s*'sign'\)/);
    expect(src).toMatch(/requireTwoFactor\(async\s*\(\)\s*=>/);
  });

  it('does not call revoke.mutate directly from the button', () => {
    expect(src).not.toMatch(/onClick=\{\(\)\s*=>\s*revoke\.mutate\(a\)\}/);
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*guardedRevoke\(a\)\}/);
  });
});
