// SEC-04 (QA 2026-09-21, I3 deniability). Two residues survived the provider's
// panic wipe, and the second one is invisible to inspectKeyMaterial():
//
// (a) panicWipe() and discardIncompleteWallet() called
//     setBiometricUnlockEnabled(false) AFTER panicWipeLocal(). That writes '0'
//     (an explicit opt-out, deliberately not a remove), so it RE-CREATED
//     'veyrnox-biometric-unlock', a key in ALL_RESIDUE_KEYS. The wipe's own
//     inspector then reported clean:false.
// (b) sessionStorage 'veyrnox-nav-current' / 'veyrnox-nav-previous'
//     (lib/backNavigation.js) survived, naming '/duress-pin' and
//     '/stealth-wallets'. That is the same tell as 'veyrnox-recent-pages', which
//     IS swept. They were absent from SESSION_RESIDUE_KEYS, so the inspector
//     could not see them either.
//
// Driven through the REAL WalletProvider, because the bug is an ordering bug in
// the provider. A wallet-core-only test cannot see it. Harness follows
// WalletProvider.duressFastpathClear.test.jsx: only the native biometric
// storage layer is stubbed.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/lib/biometricUnlock', () => ({
  storeUnlockSecret: vi.fn(async () => true),
  retrieveUnlockSecret: vi.fn(async () => null),
  clearUnlockSecret: vi.fn(async () => {}),
  hasStoredUnlockSecret: vi.fn(async () => false),
  biometricUnlockSupported: () => true,
  hasBiometricConsentBeenRecorded: () => true,
}));
vi.mock('@/plugins/androidBiometricCache', () => ({
  putFastpathDek: vi.fn(async () => {}),
  getFastpathDek: vi.fn(async () => null),
  clearFastpathDek: vi.fn(async () => {}),
}));

import { WalletProvider, useWallet } from '@/lib/WalletProvider';
import { setAuthModel, clearAuthModel } from '@/lib/authModel';
import { setBiometricUnlockEnabled } from '@/lib/biometric';
import { inspectKeyMaterial, clearWipeMarker } from '@/wallet-core/panic';

const REAL_PIN = '135724680000';
const BIO_KEY = 'veyrnox-biometric-unlock';
const NAV_KEYS = ['veyrnox-nav-current', 'veyrnox-nav-previous'];

let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

async function seedTells() {
  await act(async () => { await ctx.createWallet(REAL_PIN); });
  // createWallet seeds the chaff pool fire-and-forget. Let that settle first,
  // so this test measures the wipe and not a wipe racing in-flight chaff writes.
  await waitFor(async () => {
    const keys = (await inspectKeyMaterial()).indexedDbKeys;
    for (const k of ['secondary', 'tertiary', 'vault:256']) expect(keys).toContain(k);
  }, { timeout: 20000 });
  setBiometricUnlockEnabled(true);
  sessionStorage.setItem('veyrnox-nav-current', '/duress-pin');
  sessionStorage.setItem('veyrnox-nav-previous', '/stealth-wallets');
  expect(localStorage.getItem(BIO_KEY)).toBe('1');
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  try { sessionStorage.clear(); } catch { /* shimmed */ }
  setAuthModel('pin');
});
afterEach(() => { cleanup(); clearAuthModel(); clearWipeMarker(); });

describe('SEC-04: the provider panic wipe leaves no residue its own inspector flags', () => {
  it('panicWipe() leaves neither the biometric pref nor the nav-route session keys, and inspectKeyMaterial() is clean', async () => {
    await renderProvider();
    await seedTells();

    await act(async () => { await ctx.panicWipe({ confirmed: true }); });

    expect(localStorage.getItem(BIO_KEY)).toBeNull();
    for (const k of NAV_KEYS) expect(sessionStorage.getItem(k)).toBeNull();
    const report = await inspectKeyMaterial();
    expect(report.localStorageResidue).toEqual([]);
    expect(report.sessionStorageResidue).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it('inspectKeyMaterial() reports the nav-route keys as residue while they exist (the inspector can see them)', async () => {
    sessionStorage.setItem('veyrnox-nav-current', '/duress-pin');
    sessionStorage.setItem('veyrnox-nav-previous', '/stealth-wallets');
    const report = await inspectKeyMaterial();
    for (const k of NAV_KEYS) expect(report.sessionStorageResidue).toContain(k);
    expect(report.clean).toBe(false);
  });

  it('discardIncompleteWallet() (setup rollback) does not re-create the biometric pref either', async () => {
    await renderProvider();
    await seedTells();

    await act(async () => { await ctx.discardIncompleteWallet(); });

    expect(localStorage.getItem(BIO_KEY)).toBeNull();
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });
});
