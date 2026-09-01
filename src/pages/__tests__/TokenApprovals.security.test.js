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

  // fetchRiskNoteAsync withholds the remote TIP screen below the AI Security
  // Protection tier, so the tier is an INPUT to this query. Omitted from the
  // key, a user who upgrades mid-session keeps the notes cached while they were
  // on the free tier for the whole staleTime — refetchOnWindowFocus is off, so
  // nothing re-triggers. They paid for the warning and do not get it.
  //
  // Source-level assertion on purpose, and no stronger than that: the failure
  // mode it guards is literally "someone removes the identifier from the key",
  // which a string match sees. It does NOT prove cache behaviour at runtime.
  it('keys the risk-note query on the tier that gates its own result', () => {
    expect(src).toMatch(/queryKey:\s*\["approval-risk-notes",\s*currentTier,\s*\.\.\.spenders\]/);
    expect(src).toMatch(/const\s*\{\s*currentTier\s*\}\s*=\s*useTier\(\)/);
  });
});
