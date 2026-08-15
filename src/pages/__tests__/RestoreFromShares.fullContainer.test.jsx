// Branch review 2026-08-15 (C-2) — cross-device restore preserves the FULL
// container, not just wallets[0].
//
// #1807 fixed a silent data-loss bug: restoreFromRecoveryBundles called
// importWallet(wallets[0].mnemonic, pin), which builds a FRESH single-wallet
// container. Every wallet beyond the first, and every set-level record living
// inside the container (actionPassword, hiddenWallet2faMode, lastUnlockAt), was
// discarded while the restore reported success. A user who exported bundles
// after adding a second seed got one wallet back and no error.
//
// It shipped without a test. That is the gap this file closes: the fix is a
// behavioural property nothing asserted, so the regression could return and the
// whole suite would stay green.
//
// Sibling file rather than a new case in RestoreFromShares.integration.test.jsx:
// that suite is describe.sequential over module-scoped single-wallet fixtures,
// and swapping a two-wallet fixture into it would couple the two. Its stale
// scope note (which described the pre-#1807 limitation as intentional) is
// corrected in the same commit.
//
// Drives the PROVIDER boundary directly rather than the UI. The UI path is
// already covered end-to-end by the integration suite at a ~120s timeout; what
// is unpinned is what restoreFromRecoveryBundles WRITES, so this asserts the
// persisted vault rather than re-walking the screens.

import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

// Public BIP-39 test vectors — never user secrets.
const MNEMONIC_A =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_B =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const RESTORE_PIN = '24681024';
// Set-level records the container must carry through a restore. Built with the
// PRODUCTION serializer in beforeAll rather than hand-written: validateContainer
// rejects a malformed Action Password record, and an invented literal was
// rejected outright — the container validating its own shape is a good thing,
// and the test has to respect it. Salt/hash are fixed test bytes run through
// the real encoder, never a real credential, and the params are the minimum
// wellFormedParams accepts so no Argon2 work happens here.
let ACTION_PASSWORD_RECORD;
const FIXTURE_LAST_UNLOCK_AT = 1723000000000;

let WalletProvider;
let useWallet;
let webKeyStore;
let clearVault;
let mv;
let bundleOne;
let bundleTwo;
let walletContext;
let fixtureContainer;

function CaptureWalletContext() {
  walletContext = useWallet();
  return null;
}

function renderProvider() {
  return render(
    <WalletProvider>
      <CaptureWalletContext />
    </WalletProvider>,
  );
}

beforeAll(async () => {
  // shardBackup reads the gate once at module load — opt in before importing
  // anything that can reach it (same ordering the integration suite relies on).
  vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');

  ({ WalletProvider, useWallet } = await import('@/lib/WalletProvider'));
  ({ webKeyStore } = await import('@/wallet-core/keystore/web.js'));
  ({ clearVault } = await import('@/wallet-core/evm/vaultStore.js'));
  mv = await import('@/wallet-core/multiVault.js');

  const [{ encryptVaultWithDek }, shardBackup] = await Promise.all([
    import('@/wallet-core/vault.js'),
    import('@/wallet-core/shardBackup.js'),
  ]);

  // TWO wallets plus a set-level record — the shape the old code silently
  // truncated. addWallet is the same production call the Wallet Manager uses.
  // addWallet returns { container, walletId } — not a bare container.
  const single = mv.migrateLegacyMnemonic(MNEMONIC_A).container;
  const withTwo = mv.addWallet(single, MNEMONIC_B).container;
  // Rebuild with SET-LEVEL records actually populated. Without this the
  // actionPassword assertion compares undefined to undefined and passes no
  // matter what the restore does — a hollow test (the #1418 pattern). Proven
  // by mutation: with the records set, reverting the fix turns that case red;
  // without them it stayed green.
  const { serializeActionPasswordRecord } = await import('@/wallet-core/actionPassword.js');
  ACTION_PASSWORD_RECORD = serializeActionPasswordRecord({
    salt: new Uint8Array(16).fill(7),
    hash: new Uint8Array(32).fill(9),
    params: { parallelism: 1, iterations: 2, memorySize: 1024, hashLength: 32 },
  });
  const twoWallets = mv.makeContainer(
    withTwo.wallets,
    ACTION_PASSWORD_RECORD,
    FIXTURE_LAST_UNLOCK_AT,
  );
  expect(twoWallets.wallets).toHaveLength(2);        // fixture sanity
  expect(twoWallets.actionPassword).toBeTruthy();    // the assertion needs a REAL value
  fixtureContainer = twoWallets;

  const dek = new Uint8Array(shardBackup.SECRET_SIZE).fill(0x5a);
  const dekEncryptedVault = await encryptVaultWithDek(
    mv.serializeContainer(twoWallets), dek,
  );
  // Persisted KEK vaults retain the vestigial Argon2 `salt`; encodeShareBundle
  // validates that shape. Excluded from kek-dek AAD, so it does not change the
  // sealed ciphertext (same modelling as the integration suite).
  const encryptedVault = { ...dekEncryptedVault, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' };
  const shares = shardBackup.splitDekForPersonalBackup(dek);
  bundleOne = JSON.stringify(shardBackup.encodeShareBundle(shares[0], 1, encryptedVault));
  bundleTwo = JSON.stringify(shardBackup.encodeShareBundle(shares[1], 2, encryptedVault));
});

beforeEach(async () => {
  try { await clearVault(); } catch { /* noop */ }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe.sequential('restoreFromRecoveryBundles — full-container preservation (C-2)', () => {
  it('restores BOTH wallets, not just wallets[0]', async () => {
    renderProvider();
    await waitFor(() => expect(walletContext).toBeTruthy());

    await walletContext.restoreFromRecoveryBundles([bundleOne, bundleTwo], RESTORE_PIN);

    // Read the PERSISTED vault back rather than trusting in-memory state — the
    // bug was that the wrong thing got WRITTEN, so the disk shape is the claim.
    const plaintext = await webKeyStore.unlock(RESTORE_PIN);
    const { container } = mv.parseVault(plaintext);

    expect(container.wallets).toHaveLength(2);
    const mnemonics = container.wallets.map((w) => w.mnemonic);
    expect(mnemonics).toContain(MNEMONIC_A);
    expect(mnemonics).toContain(MNEMONIC_B);
  });

  it('preserves the set-level actionPassword record through the restore', async () => {
    // actionPassword lives INSIDE the container, so the old fresh-container
    // path dropped it even for a single-wallet vault. Guarded separately from
    // the wallet count so a partial fix cannot pass on the count alone.
    renderProvider();
    await waitFor(() => expect(walletContext).toBeTruthy());

    await walletContext.restoreFromRecoveryBundles([bundleOne, bundleTwo], RESTORE_PIN);

    const plaintext = await webKeyStore.unlock(RESTORE_PIN);
    const { container } = mv.parseVault(plaintext);
    // The fixture carries whatever migrateLegacyMnemonic/addWallet produce; the
    // property under test is that the FIELD survives the round trip rather than
    // being reset by a fresh makeContainer.
    // Compared against the FIXTURE captured in beforeAll, not a re-derivation:
    // wallet ids are freshly random per makeContainer call, so rebuilding the
    // container here would compare against a different object every run.
    expect(container.actionPassword).toEqual(ACTION_PASSWORD_RECORD);
    expect(container.lastUnlockAt).toEqual(FIXTURE_LAST_UNLOCK_AT);
  });

  it('surfaces every restored wallet in provider state, not just the first', async () => {
    // The disk assertions above prove the WRITE. This proves the app reflects
    // it — a restore that persisted both but displayed one would still look
    // like data loss to the user.
    //
    // HONEST LIMIT, mutation-proven: this case does NOT catch the original bug.
    // Reverting to the single-wallet write turns the two disk assertions red
    // while this one stays green, because provider state is hydrated from the
    // in-memory restoredContainer regardless of what reached the keystore. It
    // guards the hydration half only — do not read it as covering the write.
    renderProvider();
    await waitFor(() => expect(walletContext).toBeTruthy());

    await walletContext.restoreFromRecoveryBundles([bundleOne, bundleTwo], RESTORE_PIN);

    await waitFor(() => expect(walletContext.isUnlocked).toBe(true));
    await waitFor(() => expect(walletContext.wallets).toHaveLength(2));
    expect(walletContext.isDecoy).toBe(false);
    expect(walletContext.isHidden).toBe(false);
  });

});
