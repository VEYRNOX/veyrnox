// RestoreFromShares — provider-backed cross-device recovery integration.
//
// This suite deliberately mounts the REAL WalletProvider and uses REAL bundle,
// Shamir, vault-decrypt, multi-vault, and web-keystore code. Only the browser UI
// drives the restore. A successful navigation therefore proves the page crossed
// the provider's restoreFromRecoveryBundles boundary and re-encrypted the seed
// under the chosen PIN; the persisted-vault assertions prove that boundary was
// not replaced by a UI mock.
//
// Scope note — CORRECTED 2026-08-15. This previously read: "the production
// restore currently imports only parsed.container.wallets[0] into a fresh
// container … that known limitation must be resolved as a product decision
// rather than silently encoded as successful full-container recovery in this
// test." That was right when written and is now WRONG: #1807 resolved the
// limitation — restoreFromRecoveryBundles writes the FULL restored container.
// Marked as having been wrong rather than quietly reworded, per CLAUDE.md.
//
// The fixtures here are still deliberately single-wallet, and this suite still
// asserts wallets).toHaveLength(1) — that is the fixture's shape, NOT a claim
// about what restore preserves. Full-container preservation (2 wallets +
// set-level records) is covered by RestoreFromShares.fullContainer.test.jsx.
// Do not read the length-1 assertion below as documenting a limitation.

import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const RESTORE_PIN = '24681024';
const WRONG_PIN = '13579135';

let WalletProvider;
let useWallet;
let RestoreFromShares;
let webKeyStore;
let clearVault;
let parseVault;
let bundleOne;
let bundleThree;
let walletContext;

function CaptureWalletContext() {
  walletContext = useWallet();
  return null;
}

function HomeProbe() {
  const location = useLocation();
  return <div data-testid="home-route">home:{location.pathname}</div>;
}

function renderRestorePage() {
  return render(
    <WalletProvider>
      <CaptureWalletContext />
      <MemoryRouter initialEntries={['/onboarding/restore-shares']}>
        <Routes>
          <Route path="/onboarding/restore-shares" element={<RestoreFromShares />} />
          <Route path="/" element={<HomeProbe />} />
        </Routes>
      </MemoryRouter>
    </WalletProvider>,
  );
}

function loadBundles(first = bundleOne, second = bundleThree) {
  let inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(inputs[0], { target: { value: first } });
  // ShareInput is declared inside the page component, so a state update remounts
  // both subtrees. Re-query after the first change rather than firing on the now-
  // detached second textarea node.
  inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(inputs[1], { target: { value: second } });
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
  return screen.getAllByRole('group', { name: /pin entry/i });
}

function enterPin(group, value) {
  for (const digit of value) fireEvent.keyDown(group, { key: digit });
}

function submitPin(group) {
  fireEvent.keyDown(group, { key: 'Enter' });
}

async function expectNoVaultCreated() {
  await waitFor(async () => {
    expect(await webKeyStore.hasVault()).toBe(false);
  });
  expect(walletContext.isUnlocked).toBe(false);
  expect(screen.queryByTestId('home-route')).not.toBeInTheDocument();
}

beforeAll(async () => {
  // shardBackup reads the gate once at module load, so opt in before loading any
  // production module that can reach it.
  vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');

  ({ WalletProvider, useWallet } = await import('@/lib/WalletProvider'));
  ({ default: RestoreFromShares } = await import('@/pages/RestoreFromShares'));
  ({ webKeyStore } = await import('@/wallet-core/keystore/web.js'));
  ({ clearVault } = await import('@/wallet-core/evm/vaultStore.js'));
  ({ parseVault } = await import('@/wallet-core/multiVault.js'));

  const [{ encryptVaultWithDek }, shardBackup, multiVault] = await Promise.all([
    import('@/wallet-core/vault.js'),
    import('@/wallet-core/shardBackup.js'),
    import('@/wallet-core/multiVault.js'),
  ]);

  // Build the fixture with production crypto. The fixed DEK is test-only; the
  // mnemonic is the public BIP-39 all-zero-entropy vector, never a user secret.
  const dek = new Uint8Array(shardBackup.SECRET_SIZE).fill(0x5a);
  const { container } = multiVault.migrateLegacyMnemonic(MNEMONIC);
  const dekEncryptedVault = await encryptVaultWithDek(
    multiVault.serializeContainer(container),
    dek,
  );
  // A persisted KEK vault retains the original Argon2 `salt` field when its
  // ciphertext is replaced by encryptVaultWithDek (web/native enrollment both
  // spread the prior blob). encodeShareBundle validates that persisted shape.
  // kek-dek AAD intentionally excludes this vestigial field, so adding it here
  // precisely models disk format without changing the sealed ciphertext.
  const encryptedVault = { ...dekEncryptedVault, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' };
  const shares = shardBackup.splitDekForPersonalBackup(dek);
  bundleOne = JSON.stringify(shardBackup.encodeShareBundle(shares[0], 1, encryptedVault));
  bundleThree = JSON.stringify(shardBackup.encodeShareBundle(shares[2], 3, encryptedVault));

  dek.fill(0);
  for (const share of shares) share.fill(0);
});

beforeEach(async () => {
  cleanup();
  walletContext = null;
  try { localStorage.clear(); } catch { /* shimmed */ }
  await clearVault();
});

afterEach(async () => {
  cleanup();
  await clearVault();
  try { localStorage.clear(); } catch { /* shimmed */ }
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe.sequential('RestoreFromShares — real WalletProvider integration', () => {
  it('fails closed for a short PIN before any vault is created', async () => {
    renderRestorePage();
    const [pinPad, confirmationPad] = loadBundles();

    enterPin(pinPad, '2468102');
    enterPin(confirmationPad, '2468102');
    submitPin(confirmationPad);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too short \(8 digits\)/i);
    await expectNoVaultCreated();
  });

  it('fails closed when the confirmation PIN does not match', async () => {
    renderRestorePage();
    const [pinPad, confirmationPad] = loadBundles();

    enterPin(pinPad, RESTORE_PIN);
    enterPin(confirmationPad, '24681025');
    submitPin(confirmationPad);

    expect(await screen.findByRole('alert')).toHaveTextContent(/pins do not match/i);
    await expectNoVaultCreated();
  });

  it('rejects duplicate shares without creating or unlocking a vault', async () => {
    renderRestorePage();
    const [pinPad, confirmationPad] = loadBundles(bundleOne, bundleOne);

    enterPin(pinPad, RESTORE_PIN);
    enterPin(confirmationPad, RESTORE_PIN);
    submitPin(confirmationPad);

    expect(await screen.findByRole('alert')).toHaveTextContent('SHARD_BUNDLE_MISMATCH');
    await expectNoVaultCreated();
  });

  it('restores from two valid bundles through WalletProvider, routes home, and rejects a wrong PIN', async () => {
    const consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    try {
      renderRestorePage();
      const [pinPad, confirmationPad] = loadBundles();

      enterPin(pinPad, RESTORE_PIN);
      enterPin(confirmationPad, RESTORE_PIN);
      submitPin(confirmationPad);

      expect(await screen.findByTestId('home-route', {}, { timeout: 120_000 })).toHaveTextContent('home:/');
      await waitFor(() => expect(walletContext.isUnlocked).toBe(true), { timeout: 120_000 });
      expect(walletContext.isDecoy).toBe(false);
      expect(walletContext.isHidden).toBe(false);
      expect(walletContext.wallets).toHaveLength(1);
      expect(await webKeyStore.hasVault()).toBe(true);

      // The persisted result is genuinely wrapped by the selected PIN. A wrong
      // PIN fails closed; the selected PIN decrypts the real restored container.
      await expect(webKeyStore.unlock(WRONG_PIN)).rejects.toThrow();
      const restoredPlaintext = await webKeyStore.unlock(RESTORE_PIN);
      expect(parseVault(restoredPlaintext).container.wallets[0].mnemonic).toBe(MNEMONIC);

      // Neither the page nor production logs may echo recovery material. Bundle
      // ciphertext is also treated as sensitive: it is enough to restore when
      // paired with another share, so assert both complete inputs stay absent.
      const rendered = document.body.textContent || '';
      expect(rendered).not.toContain(MNEMONIC);
      expect(rendered).not.toContain(RESTORE_PIN);
      expect(rendered).not.toContain(bundleOne);
      expect(rendered).not.toContain(bundleThree);

      const persistedVaultText = JSON.stringify(await webKeyStore.getPersistedVault());
      expect(persistedVaultText).not.toContain(MNEMONIC);
      expect(persistedVaultText).not.toContain(RESTORE_PIN);
      expect(persistedVaultText).not.toContain(bundleOne);
      expect(persistedVaultText).not.toContain(bundleThree);

      const localStorageText = Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index);
        return `${key}:${key == null ? '' : localStorage.getItem(key)}`;
      }).join('\n');
      expect(localStorageText).not.toContain(MNEMONIC);
      expect(localStorageText).not.toContain(RESTORE_PIN);
      expect(localStorageText).not.toContain(bundleOne);
      expect(localStorageText).not.toContain(bundleThree);

      const consoleOutput = consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((value) => {
          if (typeof value === 'string') return value;
          try { return JSON.stringify(value); } catch { return String(value); }
        })
        .join('\n');
      expect(consoleOutput).not.toContain(MNEMONIC);
      expect(consoleOutput).not.toContain(RESTORE_PIN);
      expect(consoleOutput).not.toContain(bundleOne);
      expect(consoleOutput).not.toContain(bundleThree);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
    }
  }, 120_000);
});
