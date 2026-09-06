// Settings — Wallet Passkeys block must be deniability-gated (K-2 class).
//
// Wallet rows live in the SHARED veyrnox-appdata IndexedDB: one record per
// entity name, no per-session partitioning, cleared only by panic wipe. So a
// decoy/hidden session reads the REAL user's rows unless the page gates them.
// Two ways that bites here:
//   read  — the Wallet Passkeys block maps over `wallets`, rendering real
//           wallet names, currencies and count. The design system's rule is
//           "never show wallet count/list" in deniability.
//   write — registerPasskey writes passkey_registered / passkey_credential_id
//           onto a real wallet row.
//
// The block sits OUTSIDE the security-settings ternary (Settings.jsx:353),
// which is gated, and was guarded only by `!isNative`. Fix is the same
// two-chokepoint shape as AddressBook.jsx / PriceAlerts.jsx / NetworkManager.jsx.
//
// Source-scan, matching Settings.change-pin-link.test.js: Settings.jsx pulls in
// base44 + react-query + a dozen child components, so a full render is
// disproportionate for verifying two guards.
//
// Found by reviewing the Settings.jsx security-block gate after the 2026-09-06
// Gemini sweep (#2372).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const settingsCode = readFileSync(resolve(here, '../Settings.jsx'), 'utf8');

// Strip comments so a pin can never be satisfied by the prose that documents
// it — the failure mode recorded in CLAUDE.md's working-pattern notes.
const code = settingsCode
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

describe('Settings — Wallet Passkeys deniability gate', () => {
  it('derives a `deniable` flag covering decoy, hidden and deniability sessions', () => {
    expect(code).toMatch(
      /const\s+deniable\s*=\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*isDeniability\s*;/,
    );
  });

  // Read chokepoint 1: the query must not run at all in a deniable session.
  it('disables the wallets query in a deniable session', () => {
    const q = code.match(/queryKey:\s*\["wallets"\][\s\S]{0,220}?\}\);/);
    expect(q, 'wallets query not found').toBeTruthy();
    expect(q[0]).toMatch(/enabled:\s*!deniable/);
  });

  // Read chokepoint 2: belt-and-braces blank of the derived list, so a cached
  // or in-flight result cannot render either.
  it('blanks the derived wallets list in a deniable session', () => {
    expect(code).toMatch(/const\s+wallets\s*=\s*deniable\s*\?\s*\[\]\s*:\s*walletsRaw\s*;/);
  });

  // Write chokepoint: the mutation must refuse before touching the store.
  it('makes registerPasskey throw DENIABILITY_BLOCKED before writing', () => {
    const m = code.match(/const\s+registerPasskey\s*=\s*useMutation\(\{[\s\S]*?\n\s*\}\);/);
    expect(m, 'registerPasskey mutation not found').toBeTruthy();
    expect(m[0]).toMatch(/if\s*\(deniable\)/);
    expect(m[0]).toMatch(/DENIABILITY_BLOCKED/);
    // The guard must precede the write, not merely coexist with it.
    expect(m[0].indexOf('DENIABILITY_BLOCKED')).toBeLessThan(
      m[0].indexOf('entities.Wallet.update'),
    );
  });
});
