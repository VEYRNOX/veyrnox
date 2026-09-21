// #2713 (QA 2026-09-21, I3 deniability). createWallet, importWallet and
// restoreFromRecoveryBundles start deniability chaff provisioning
// fire-and-forget (ensureStealthPool + provisionDeniabilityChaff). Nothing
// tracked those promises, so a panic wipe run while they were in flight
// finished FIRST and the late chaff writes then re-created storage after it
// (258 chaff entries observed in this harness). The SEC-04 test deliberately
// waits for chaff before wiping; this file is the case it does not cover.
//
// Each case wipes WITHOUT awaiting provisioning, then waits for every chaff
// promise the provider started to settle, and only THEN inspects storage. The
// promises are observed through a pass-through wrapper that calls the REAL
// implementation and only records what it returns; no control is stubbed. Only
// the native biometric storage layer is stubbed, as in the SEC-04 harness.
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

const pending = [];
vi.mock('@/wallet-core/provisionChaff', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    provisionDeniabilityChaff: (...a) => {
      const p = actual.provisionDeniabilityChaff(...a);
      pending.push(p);
      return p;
    },
  };
});
vi.mock('@/wallet-core/stealth', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureStealthPool: (...a) => {
      const p = actual.ensureStealthPool(...a);
      pending.push(p);
      return p;
    },
  };
});
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

// Public BIP-39 test vector, never a user secret.
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const REAL_PIN = '135724680000';
const RESTORE_PIN = '24681024';

let WalletProvider, useWallet, setAuthModel, clearAuthModel, inspectKeyMaterial, clearWipeMarker;
let bundleOne, bundleTwo;
let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

// Wait for EVERY chaff promise the provider started, including any that were
// still in flight when the wipe returned, then inspect.
async function settleAllChaff() {
  while (pending.length) await Promise.allSettled(pending.splice(0));
  await new Promise((r) => setTimeout(r, 0));
}

async function expectStorageEmptyAfterSettle() {
  await settleAllChaff();
  const report = await inspectKeyMaterial();
  expect(report.indexedDbKeys).toEqual([]);          // no vault / chaff / stealth slot
  expect(report.localStorageResidue).toEqual([]);    // no metadata tells
  expect(report.sessionStorageResidue).toEqual([]);
  expect(report.secureStoreResidue).toEqual([]);     // no secure-store entry
  expect(report.clean).toBe(true);
}

beforeAll(async () => {
  vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  ({ WalletProvider, useWallet } = await import('@/lib/WalletProvider'));
  ({ setAuthModel, clearAuthModel } = await import('@/lib/authModel'));
  ({ inspectKeyMaterial, clearWipeMarker } = await import('@/wallet-core/panic'));
  const mv = await import('@/wallet-core/multiVault.js');
  const { encryptVaultWithDek } = await import('@/wallet-core/vault.js');
  const shardBackup = await import('@/wallet-core/shardBackup.js');
  const { container } = mv.migrateLegacyMnemonic(MNEMONIC);
  const dek = new Uint8Array(shardBackup.SECRET_SIZE).fill(0x5a);
  const sealed = await encryptVaultWithDek(mv.serializeContainer(container), dek);
  // Vestigial Argon2 salt, same modelling as RestoreFromShares.fullContainer.
  const vault = { ...sealed, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' };
  const shares = shardBackup.splitDekForPersonalBackup(dek);
  bundleOne = JSON.stringify(shardBackup.encodeShareBundle(shares[0], 1, vault));
  bundleTwo = JSON.stringify(shardBackup.encodeShareBundle(shares[1], 2, vault));
});

beforeEach(async () => {
  pending.length = 0;
  try { localStorage.clear(); } catch { /* shimmed */ }
  try { sessionStorage.clear(); } catch { /* shimmed */ }
  setAuthModel('pin');
});
afterEach(async () => {
  await settleAllChaff();
  cleanup();
  clearAuthModel();
  clearWipeMarker();
});
afterAll(() => { vi.unstubAllEnvs(); });

describe('#2713: a panic wipe racing in-flight chaff provisioning leaves no residue', () => {
  it('create -> immediate panicWipe', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    expect(pending.length).toBeGreaterThan(0); // provisioning really was started
    await act(async () => { await ctx.panicWipe({ confirmed: true }); });
    await expectStorageEmptyAfterSettle();
  }, 60000);

  it('import -> immediate panicWipe', async () => {
    await renderProvider();
    await act(async () => { await ctx.importWallet(MNEMONIC, REAL_PIN); });
    expect(pending.length).toBeGreaterThan(0);
    await act(async () => { await ctx.panicWipe({ confirmed: true }); });
    await expectStorageEmptyAfterSettle();
  }, 60000);

  it('restore from recovery bundles -> immediate panicWipe', async () => {
    await renderProvider();
    await act(async () => { await ctx.restoreFromRecoveryBundles([bundleOne, bundleTwo], RESTORE_PIN); });
    expect(pending.length).toBeGreaterThan(0);
    await act(async () => { await ctx.panicWipe({ confirmed: true }); });
    await expectStorageEmptyAfterSettle();
  }, 60000);

  it('create -> immediate discardIncompleteWallet (setup rollback)', async () => {
    await renderProvider();
    await act(async () => { await ctx.createWallet(REAL_PIN); });
    expect(pending.length).toBeGreaterThan(0);
    await act(async () => { await ctx.discardIncompleteWallet(); });
    await expectStorageEmptyAfterSettle();
  }, 60000);
});
