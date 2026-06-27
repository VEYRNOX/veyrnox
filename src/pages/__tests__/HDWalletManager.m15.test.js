// Structural regression guard for audit finding M15 in HDWalletManager.jsx.
//
// M15: the inline copy lambda called navigator.clipboard.writeText directly, with
// no wipe timer, so a copied recovery phrase persisted on the OS clipboard
// indefinitely. copySecret (lib/copySecret.js) writes the value AND schedules
// a best-effort 30s wipe.
//
// The copy helper is sensitivity-aware: sensitive=true (seed) routes through
// copySecret; sensitive=false (addresses) uses a plain write so the clipboard
// is not wiped when the user copies a receive address to paste elsewhere.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../HDWalletManager.jsx'), 'utf8');

describe('HDWalletManager — M15: seed copies route through copySecret (wipe timer)', () => {
  it('imports copySecret from lib/copySecret', () => {
    expect(src).toMatch(/import\s*\{\s*copySecret\s*\}\s*from\s*["'](?:@\/lib\/copySecret|\.\.\/lib\/copySecret)["']/);
  });

  it('copy helper accepts a sensitive flag and calls copySecret when true', () => {
    expect(src).toMatch(/sensitive.*copySecret|copySecret.*sensitive/s);
    expect(src).toMatch(/if\s*\(sensitive\)/);
  });

  it('seed copy site passes sensitive=true', () => {
    expect(src).toMatch(/copy\(generatedSeed,\s*["']seed["'],\s*true\)/);
  });

  it('address copy sites do not pass sensitive=true (no clipboard wipe for public values)', () => {
    expect(src).not.toMatch(/copy\(evmAddress.*true\)/);
    expect(src).not.toMatch(/copy\(address.*true\)/);
  });
});
