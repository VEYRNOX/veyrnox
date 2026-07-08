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

  // NOTE: the seed-display copy site (copy(generatedSeed, "seed", true)) was
  // removed when the vault-creating "Generate New" surface was deleted from
  // HDWalletManager (HIGH silent-overwrite / PIN-lockout hazard, I4). This page
  // no longer reveals a mnemonic, so there is no sensitive copy site here. The
  // sensitivity-aware routing in makeCopy is still exercised above and remains
  // available for any future sensitive copy. Guard that no seed reveal returned.
  it('no longer copies a generated seed (create surface removed)', () => {
    expect(src).not.toMatch(/generatedSeed/);
  });

  it('address copy sites do not pass sensitive=true (no clipboard wipe for public values)', () => {
    expect(src).not.toMatch(/copy\(evmAddress.*true\)/);
    expect(src).not.toMatch(/copy\(address.*true\)/);
  });
});
