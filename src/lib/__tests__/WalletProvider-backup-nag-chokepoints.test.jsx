// WalletProvider ↔ backupNag chokepoint wiring (Slice G+H plan §1).
//
// Source-level test rather than a full mount: WalletProvider pulls the KEK,
// vault, referrals, and analytics tree — mounting it just to verify the 5
// chokepoints each call backupNag.onVaultKeySetChanged() is a heavier surface
// than the invariant needs. Same technique as FirstRunTour.placement.test.js.
//
// The plan requires the call to fire inside each of these 5 named mutations
// (WalletProvider.jsx line numbers per plan §4):
//   createWallet (910), importWallet (964), addWallet (1052),
//   importAdditionalWallet (1074), removeWallet (1095).
//
// RED phase: WalletProvider.jsx does not yet import backupNag.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/lib/WalletProvider.jsx'), 'utf8');

const CHOKEPOINTS = [
  'createWallet',
  'importWallet',
  'addWallet',
  'importAdditionalWallet',
  'removeWallet',
];

function fnBodyRange(name) {
  // useCallback pattern: `const <name> = useCallback(async (...) => {`
  const decl = new RegExp(`const\\s+${name}\\s*=\\s*useCallback\\s*\\(`, 'g');
  const m = decl.exec(SRC);
  if (!m) return null;
  const start = m.index;
  // walk to matching closing `),` of useCallback — approximate: next declaration.
  const nextConst = SRC.indexOf('\n  const ', start + 10);
  const end = nextConst > -1 ? nextConst : Math.min(SRC.length, start + 4000);
  return SRC.slice(start, end);
}

describe('WalletProvider — backupNag.onVaultKeySetChanged at all 5 chokepoints', () => {
  it('imports backupNag', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/backupNag['"]|from\s+['"]\.\/backupNag['"]/);
  });

  it.each(CHOKEPOINTS)('%s calls backupNag.onVaultKeySetChanged with a sorted address array', (name) => {
    const body = fnBodyRange(name);
    expect(body, `could not locate function body for ${name}`).not.toBeNull();
    expect(body).toMatch(/onVaultKeySetChanged\s*\(/);
    // Sorted contract: callback passes the sorted address list, either via an
    // inline `.sort(` OR via the shared `getBackupPublicAddresses()` helper
    // (which sorts internally). getBackupPublicAddresses is verified to sort
    // in the WalletProvider source (see the callback where it is defined).
    expect(body).toMatch(/\.sort\s*\(|getBackupPublicAddresses\s*\(/);
  });
});
