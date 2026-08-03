// src/lib/__tests__/WalletProvider.confirmWalletBackup.decoy.test.js
//
// Audit 2026-08-03 H-3 — `confirmWalletBackup` had no isDecoy/isHidden guard,
// while EIGHT sibling mutators in the same provider do. It is reached
// unconditionally from WalletSeedQR's Print/Share handler, which carries no gate
// of its own and IS reachable in a decoy session.
//
// Why that matters: backing up the decoy's seed under coercion is normal,
// expected, and the thing that makes a decoy convincing. Doing it called
// setWalletBackedUp(decoyWalletId, true), writing a new entry keyed by the
// decoy/hidden wallet's real UUID into the shared, un-namespaced
// `veyrnox-wallet-meta` blob — whose own header states hidden/duress wallets are
// "NOT referenced here". A forensic inspection then shows MORE wallet-id entries
// than the user admits to owning, which is positive evidence that a hidden
// wallet exists. `veyrnox-wallet-meta` is swept by panicWipe, but it survives
// lock/relock — and a coerced user is unlocking, not wiping.
//
// The write was also functionally pointless: decoy wallets are already hardcoded
// backedUp:true at unlock, so nothing in that session reads the flag.
//
// The in-code rationale ("Cheap localStorage flip ... it is not secret") reasoned
// about the secrecy of the VALUE and missed that the PRESENCE of the key is the
// tell — the same error recorded in the 2026-07-28 residue finding.
//
// STRUCTURAL assertions over the provider source — the established pattern for
// provider-internal callbacks that are awkward to drive through jsdom (see
// WalletProvider.m6.test.js, WalletProvider.clearActionPassword.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

// Isolate the confirmWalletBackup callback, including its dependency array.
const fnStart = providerSrc.indexOf('const confirmWalletBackup = useCallback');
const depsEnd = providerSrc.indexOf(']);', fnStart);
const body = providerSrc.slice(fnStart, depsEnd + 3);

describe('H-3 — confirmWalletBackup must not write wallet metadata from a decoy/hidden session', () => {
  it('defines confirmWalletBackup', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(depsEnd).toBeGreaterThan(fnStart);
  });

  it('guards on isDecoy || isHidden', () => {
    expect(body).toMatch(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)/);
  });

  it('bails out BEFORE setWalletBackedUp writes to shared localStorage', () => {
    // Presence of the guard is not enough — it must short-circuit ahead of the
    // write, which is the whole finding.
    const guardIdx = body.search(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)/);
    const writeIdx = body.indexOf('setWalletBackedUp');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(writeIdx);
  });

  it('returns from the guard rather than falling through', () => {
    const guardIdx = body.search(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)/);
    const afterGuard = body.slice(guardIdx, guardIdx + 120);
    expect(afterGuard).toMatch(/\breturn\b|\bthrow\b/);
  });

  it('lists isDecoy and isHidden in the useCallback deps so the guard cannot go stale', () => {
    // A guard reading a captured-but-undeclared value would freeze at its
    // first-render value — the guard would silently stop working after a session
    // switch. Every sibling guarded mutator declares both.
    const deps = body.slice(body.lastIndexOf('}, ['));
    expect(deps).toMatch(/\bisDecoy\b/);
    expect(deps).toMatch(/\bisHidden\b/);
  });
});
