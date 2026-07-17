// Regression guard: the /hd-wallet unlock surface must follow the auth cohort.
// The vault credential for every real vault post-PR #651 is an 8-digit PIN, so a
// PIN-cohort user reaching HDWalletManager (linked from the Receive screen) must
// get the PinPad — a free-text password box cannot accept a numeric PIN, a hard
// lockout (the bug class of PR #645/#651). The legacy password cohort keeps its
// free-text Input so a pre-#651 vault is never locked out.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../HDWalletManager.jsx'), 'utf8');

describe('HDWalletManager — unlock surface follows the auth cohort', () => {
  it('imports the shared PinPad and the auth-cohort reader', () => {
    expect(src).toMatch(/import\s+PinPad\s+from\s+["']@\/components\/security\/PinPad["']/);
    expect(src).toMatch(/import\s*\{\s*getAuthModel\s*\}\s*from\s*["']@\/lib\/authModel["']/);
  });

  it('derives an isPin cohort flag from getAuthModel()', () => {
    expect(src).toMatch(/const\s+isPin\s*=\s*getAuthModel\(\)\s*===\s*["']pin["']/);
  });

  it('renders a PinPad (wired to the unlock handler) for the PIN cohort', () => {
    // The unlock block branches on isPin and mounts a PinPad completing to handleUnlock.
    expect(src).toMatch(/isPin\s*\?[\s\S]*<PinPad[\s\S]*onComplete=\{handleUnlock\}/);
  });

  it('keeps the legacy free-text password box on the non-PIN branch', () => {
    // The password cohort still gets a free-text PasswordInput (a show/hide password
    // box — type="password" internally) rather than a numeric PinPad, guarded by the
    // isPin ternary, so a pre-#651 password vault is never locked out. (The raw
    // <input type="password"> was refactored to the shared PasswordInput component.)
    expect(src).toMatch(/<PasswordInput\s+id="hd-unlock-password"/);
  });
});
