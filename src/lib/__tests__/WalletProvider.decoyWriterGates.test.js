// Branch review 2026-08-15 (C-2) — regression cover for the two WalletProvider
// writer gates that shipped without a test.
//
//   1. unlock() ran ensureBiometric2faOnNative() for EVERY session type. It
//      persists to shared localStorage, so a coerced decoy unlock could enable
//      biometric-2FA and leave a forensic marker on a device where the real user
//      never turned it on.
//   2. toggleAuditLog is exposed from BOTH Settings.jsx and AuditLog.jsx, both of
//      which render in decoy/hidden sessions. Ungated, a coerced decoy unlock
//      could flip setAuditLogPref (shared localStorage) OR call
//      clearAuditLogData() to ERASE the real session's encrypted audit blob —
//      without ever unlocking the primary wallet. That destructive call is why
//      this gate matters most.
//
// Both are the K-2 class: a decoy session mutating REAL persisted state.
//
// STRUCTURAL assertions over the provider source — the established pattern for
// provider-internal callbacks that are awkward to drive through jsdom (see
// WalletProvider.decoyReferral.test.js, WalletProvider.m6.test.js,
// WalletProvider.confirmWalletBackup.decoy.test.js).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

describe('unlock() — decoy/hidden must not mutate real device settings', () => {
  it('isPrimary is still defined as !decoy && !hidden', () => {
    // The whole file leans on ONE definition of "this is the real session".
    // A second, driftable definition is the failure mode this pins.
    expect(src).toMatch(/const\s+isPrimary\s*=\s*!decoy\s*&&\s*!hidden\s*;/);
  });

  it('ensureBiometric2faOnNative is inside an isPrimary branch', () => {
    const callIdx = src.indexOf('ensureBiometric2faOnNative()');
    expect(callIdx).toBeGreaterThan(-1);
    // Walk back to the nearest `if (isPrimary) {` and require it to be closer
    // than the nearest intervening `}` that would have closed such a block.
    const before = src.slice(0, callIdx);
    const guardIdx = before.lastIndexOf('if (isPrimary) {');
    expect(guardIdx, 'no enclosing `if (isPrimary) {` found').toBeGreaterThan(-1);
    expect(before.slice(guardIdx).includes('\n    }')).toBe(false);
  });

  it('setLivePricesEnabled is not called unconditionally on the unlock path', () => {
    // Defence in depth only — the canonical guard now lives in priceFeed.js
    // (see priceFeed.setterDeniabilityGate.test.js). This asserts the unlock
    // path did not regress back to an ungated call.
    const unlockPrices = src.indexOf('I2: user restored a real wallet, expect live data');
    expect(unlockPrices).toBeGreaterThan(-1);
    const before = src.slice(0, unlockPrices);
    expect(before.lastIndexOf('if (isPrimary) {')).toBeGreaterThan(-1);
  });
});

describe('toggleAuditLog — decoy/hidden must not touch the real audit log', () => {
  // Comments must be stripped before any ORDERING assertion: the guard's own
  // explanatory comment names clearAuditLogData(), so a raw indexOf finds the
  // mention in the prose before the call in the code and the ordering check
  // passes (or fails) for the wrong reason.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const code = stripComments(src);
  const startIdx = code.indexOf('const toggleAuditLog = useCallback(');
  const block = code.slice(startIdx, startIdx + 900);

  it('the toggleAuditLog callback still exists', () => {
    expect(startIdx).toBeGreaterThan(-1);
  });

  it('is gated on the session being decoy or hidden', () => {
    expect(block).toMatch(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)\s*return\s+false\s*;/);
  });

  it('the guard runs BEFORE clearAuditLogData erases the real blob', () => {
    // Presence is not enough: clearAuditLogData() is the destructive call and it
    // is reachable from a decoy session via both Settings.jsx and AuditLog.jsx.
    const guardIdx = block.search(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)\s*return\s+false\s*;/);
    const clearIdx = block.indexOf('clearAuditLogData()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(clearIdx);
  });

  it('the guard also precedes both preference writers', () => {
    const guardIdx = block.search(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)\s*return\s+false\s*;/);
    for (const fn of ['setAuditLogPref(', 'setAuditLogEnabledState(']) {
      const idx = block.indexOf(fn);
      expect(idx, `${fn} should be present`).toBeGreaterThan(-1);
      expect(guardIdx, `${fn} should come after the guard`).toBeLessThan(idx);
    }
  });

  it('declares isDecoy/isHidden in its dependency array', () => {
    // Without them the callback closes over a stale session type — the gate
    // would read the value from whichever session mounted the provider.
    expect(block).toMatch(/\}\s*,\s*\[\s*isDecoy\s*,\s*isHidden\s*\]\s*\)/);
  });

  // Branch review 2026-08-15 (S-2). Settings.jsx drives its optimistic local
  // state off this return value, so the applied/refused contract is load-bearing
  // in BOTH directions and neither half is covered elsewhere: the Settings test
  // is a source scan and the AuditLog test mocks this provider away. Dropping
  // `return true` alone makes `applied` undefined for a PRIMARY user, so the
  // toggle silently stops working for exactly the people it should work for.
  it('returns false on refusal and true on success (the applied/refused contract)', () => {
    expect(block).toMatch(/if\s*\(\s*isDecoy\s*\|\|\s*isHidden\s*\)\s*return\s+false\s*;/);
    expect(block).toMatch(/return\s+true\s*;/);
  });

  it('the success return comes AFTER the writes it reports on', () => {
    const trueIdx = block.search(/return\s+true\s*;/);
    for (const fn of ['setAuditLogPref(', 'setAuditLogEnabledState(', 'clearAuditLogData(']) {
      const idx = block.indexOf(fn);
      expect(idx, `${fn} should be present`).toBeGreaterThan(-1);
      expect(idx, `${fn} should come before the success return`).toBeLessThan(trueIdx);
    }
  });
});

// auditLogWritable — the single render-time "can this session change the
// setting" answer, read by AuditLog.jsx and Settings.jsx. Derived once in the
// provider so neither page recomputes `!isDecoy && !isHidden` for itself; that
// three-place duplication is how the third unguarded consent writer shipped.
describe('auditLogWritable — one definition, exposed on the context', () => {
  it('is derived from the same session predicate as the gate', () => {
    expect(src).toMatch(/const\s+auditLogWritable\s*=\s*!isDecoy\s*&&\s*!isHidden\s*;/);
  });

  it('is actually exposed on the context value', () => {
    // Derived but unexported is the silent-failure shape: both pages fall back
    // to their `= true` default and the aria annotation never appears.
    const valueIdx = src.lastIndexOf('auditLogEnabled,');
    expect(src.slice(valueIdx, valueIdx + 200)).toMatch(/auditLogWritable,/);
  });
});
