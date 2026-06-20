// wallet-core/__tests__/h2-migration-and-per-set-ap.test.js
//
// H2 integration tests (the missing automated coverage called out in the H2 plan):
//
//   (A1) MIGRATION — the unpadded->padded (and legacy-bare-mnemonic->container)
//        migration the unlock path performs. WalletProvider itself is a heavy React
//        context, so we test at the closest tractable seam: the SAME keyStore +
//        parseVault/serializeContainer round-trip WalletProvider.unlock runs (see
//        WalletProvider.jsx ~:1199-1259 and the sibling multivault-keystore.test.js).
//        We assert the persisted 'primary' blob decrypts to EXACTLY FIXED_LEN after
//        migration, the wallet set is intact, and a SECOND unlock is idempotent.
//
//   (A2) PER-SET ACTION PASSWORD — setting/clearing an AP in a DECOY (duress) and a
//        HIDDEN (stealth) session persists the record to that set's OWN blob, and the
//        record round-trips on read-back. Asserted at the underlying duress/stealth
//        seam (full provider rendering is impractical here), which is exactly what
//        WalletProvider.persistActiveSetContainer drives for those sessions.
//
// Runs against REAL crypto (vault.js Argon2id+AES-GCM) and fake-indexeddb.

import { describe, it, expect, beforeEach } from 'vitest';
import { webKeyStore } from '../keystore/web.js';
import { loadVault, clearVault } from '../evm/vaultStore.js';
import * as mv from '../multiVault.js';
import { decryptVault } from '../vault.js';
import {
  setDuressVault, tryDuressUnlock, clearDuressVault,
} from '../duress.js';
import {
  createHiddenWallet, tryRevealHidden, setHiddenActionPasswordRecord, wipeStealthPool,
} from '../stealth.js';
import { panicWipeLocal } from '../panic.js';
import { generateMnemonic } from '../mnemonic.js';
import { createCredentialVerifier, verifyCredential } from '../credentialVerifier.js';
import { serializeActionPasswordRecord, deserializeActionPasswordRecord } from '../actionPassword.js';

// Verify an entered AP against a stored (serialized) container record, mirroring the
// active-set verify the gate runs (deserialize the persisted record, then compare).
const verifyStored = (record, entered) =>
  verifyCredential(deserializeActionPasswordRecord(record), entered);

const PASSWORD = 'correct horse battery staple';
const SEED_A = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

// Replicate WalletProvider.unlock's PRIMARY path including the H2 padding migration
// (WalletProvider.jsx ~:1199-1259): decrypt -> parseVault -> if migrated OR the
// on-disk plaintext is not FIXED_LEN, re-encrypt the (padded) container.
async function unlockPrimaryWithMigration(password) {
  const plaintext = await webKeyStore.unlock(password); // throws on wrong pw
  const { container, migrated } = mv.parseVault(plaintext);
  const needsMigration = migrated || plaintext.length !== mv.FIXED_LEN;
  if (needsMigration) {
    await webKeyStore.createVault(mv.serializeContainer(container), password);
  }
  return { container, migrated, needsMigration };
}

beforeEach(async () => {
  try { await clearVault(); } catch { /* noop */ }
  try { await wipeStealthPool(); } catch { /* noop */ }
  try { await clearDuressVault(); } catch { /* noop */ }
  try { await panicWipeLocal(); } catch { /* noop */ }
});

describe('H2 (A1) — unpadded -> padded migration on unlock', () => {
  it('migrates a legacy BARE mnemonic to a FIXED_LEN container; idempotent', async () => {
    // Pre-H2 (pre-multi-vault) on-disk shape: a BARE mnemonic encrypted at PASSWORD.
    await webKeyStore.createVault(SEED_A, PASSWORD);

    // First unlock migrates: bare -> container, padded to FIXED_LEN, persisted.
    const first = await unlockPrimaryWithMigration(PASSWORD);
    expect(first.migrated).toBe(true);
    expect(first.needsMigration).toBe(true);
    expect(mv.walletCount(first.container)).toBe(1);
    expect(first.container.wallets[0].mnemonic).toBe(SEED_A); // seed intact

    // The persisted plaintext is now EXACTLY FIXED_LEN.
    const blob1 = await loadVault();
    const pt1 = await decryptVault(blob1, PASSWORD);
    expect(pt1.length).toBe(mv.FIXED_LEN);
    expect(mv.parseVault(pt1).container.wallets[0].mnemonic).toBe(SEED_A);

    // SECOND unlock makes NO further change (idempotent): already a FIXED_LEN
    // container, so needsMigration is false and the blob is byte-identical.
    const blobBefore = await loadVault();
    const second = await unlockPrimaryWithMigration(PASSWORD);
    expect(second.migrated).toBe(false);
    expect(second.needsMigration).toBe(false);
    expect(await loadVault()).toEqual(blobBefore); // unchanged on disk
  });

  it('migrates an UNPADDED serialized container (pre-padding H2) to FIXED_LEN', async () => {
    // Simulate a container written by the multi-vault era BEFORE fixed-length padding:
    // a valid container JSON whose plaintext length is NOT FIXED_LEN.
    const { container } = mv.parseVault(SEED_A); // bare -> container (in-memory)
    const unpadded = JSON.stringify({
      vlt: mv.MULTI_VAULT_TAG, v: 1,
      wallets: container.wallets.map((w) => ({ id: w.id, mnemonic: w.mnemonic })),
    });
    expect(unpadded.length).not.toBe(mv.FIXED_LEN); // genuinely unpadded
    await webKeyStore.createVault(unpadded, PASSWORD);

    // Unlock detects "parsed fine but not FIXED_LEN" and re-persists padded.
    const first = await unlockPrimaryWithMigration(PASSWORD);
    expect(first.migrated).toBe(false);        // it WAS a container...
    expect(first.needsMigration).toBe(true);   // ...but unpadded, so migrate
    const pt = await decryptVault(await loadVault(), PASSWORD);
    expect(pt.length).toBe(mv.FIXED_LEN);
    expect(mv.parseVault(pt).container.wallets[0].mnemonic).toBe(SEED_A);

    // Idempotent on the next unlock.
    const second = await unlockPrimaryWithMigration(PASSWORD);
    expect(second.needsMigration).toBe(false);
  });
});

describe('H2 (A2) — per-set Action Password on decoy / hidden sets', () => {
  const DURESS_PW = 'duress-pass-1357';
  const HIDDEN_SECRET = 'hidden-secret-9753';
  const AP = 'my-action-password';

  // Read back the AP record persisted for the DECOY set ('secondary' blob).
  async function decoyApRecord() {
    const payload = await tryDuressUnlock(DURESS_PW);
    if (payload == null) return null;
    return mv.getActionPasswordRecord(mv.parseVault(payload).container);
  }
  // Read back the AP record persisted for the HIDDEN set (its stealth slot).
  async function hiddenApRecord() {
    const payload = await tryRevealHidden(HIDDEN_SECRET);
    if (payload == null) return null;
    return mv.getActionPasswordRecord(mv.parseVault(payload).container);
  }

  it('DECOY session: setActionPassword persists a verifiable record to the duress blob', async () => {
    const decoySeed = generateMnemonic(128);
    await setDuressVault(decoySeed, DURESS_PW);                 // no AP yet
    expect(await decoyApRecord()).toBeNull();                  // actionPasswordConfigured == false

    // setActionPassword (decoy path, WalletProvider.persistActiveSetContainer):
    // capture a verifier and re-encrypt the decoy blob carrying the record.
    const verifier = await createCredentialVerifier(AP);
    const record = serializeActionPasswordRecord(verifier);
    await setDuressVault(decoySeed, DURESS_PW, record);

    const persisted = await decoyApRecord();
    expect(persisted).not.toBeNull();                          // actionPasswordConfigured == true
    expect(await verifyStored(persisted, AP)).toBe(true);  // the right AP verifies
    expect(await verifyStored(persisted, 'wrong')).toBe(false);
    // The decoy seed is untouched by configuring its second factor.
    expect(mv.parseVault(await tryDuressUnlock(DURESS_PW)).container.wallets[0].mnemonic).toBe(decoySeed);
  });

  it('HIDDEN session: setActionPassword persists a verifiable record to the stealth slot', async () => {
    const { mnemonic } = await createHiddenWallet(HIDDEN_SECRET);
    expect(await hiddenApRecord()).toBeNull();

    const verifier = await createCredentialVerifier(AP);
    const record = serializeActionPasswordRecord(verifier);
    await setHiddenActionPasswordRecord(HIDDEN_SECRET, mnemonic, record);

    const persisted = await hiddenApRecord();
    expect(persisted).not.toBeNull();
    expect(await verifyStored(persisted, AP)).toBe(true);
    expect(await verifyStored(persisted, 'wrong')).toBe(false);
    // The hidden seed is unchanged by adding its AP.
    expect(mv.parseVault(await tryRevealHidden(HIDDEN_SECRET)).container.wallets[0].mnemonic).toBe(mnemonic);

    // clearActionPassword (record=null) removes it; the seed still round-trips.
    await setHiddenActionPasswordRecord(HIDDEN_SECRET, mnemonic, null);
    expect(await hiddenApRecord()).toBeNull();
    expect(mv.parseVault(await tryRevealHidden(HIDDEN_SECRET)).container.wallets[0].mnemonic).toBe(mnemonic);
  });
});
