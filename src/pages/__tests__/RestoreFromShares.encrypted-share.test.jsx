// RestoreFromShares — passphrase-wrapped bundle detection (Codex P1 fix,
// 2026-08-15 companion). PersonalBackup's export can now save share #2 as a
// passphrase-encrypted `.veyrnox-recovery.json` bundle envelope
// (recovery-bundle-v1). This restore page must detect that shape, prompt for
// the passphrase, unwrap it, and feed the RECOVERED raw bundle JSON — not the
// envelope — into restoreFromRecoveryBundles. Fails closed (surfaces the
// error) on a wrong passphrase rather than silently dropping the share.
//
// useWallet is mocked so this suite isolates the page's own unwrap-then-call
// wiring from the provider's shamir/vault/KEK chain (already covered by
// RestoreFromShares.integration.test.jsx for the raw-bundle path).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const RAW_BUNDLE_1 = JSON.stringify({
  v: 1, shareIndex: 1, shareBytes: 'AAAA', vault: { ct: 'c', salt: 's', iv: 'i', kdf: {} }, vaultHash: 'h', meta: {},
});
const RAW_BUNDLE_2 = JSON.stringify({
  v: 1, shareIndex: 2, shareBytes: 'BBBB', vault: { ct: 'c', salt: 's', iv: 'i', kdf: {} }, vaultHash: 'h', meta: {},
});
const PASSPHRASE = 'a-very-long-recovery-passphrase';

let wrappedBundle2;

beforeEach(async () => {
  vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  vi.resetModules();
  const { wrapBundleWithPassphrase } = await import('@/wallet-core/recoveryShare');
  wrappedBundle2 = await wrapBundleWithPassphrase(
    new TextEncoder().encode(RAW_BUNDLE_2),
    PASSPHRASE,
    2,
  );
}, 30_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  cleanup();
});

async function loadPage(restoreFromRecoveryBundles) {
  vi.doMock('@/lib/WalletProvider', () => ({
    useWallet: () => ({ restoreFromRecoveryBundles }),
  }));
  const { default: RestoreFromShares } = await import('@/pages/RestoreFromShares');
  return RestoreFromShares;
}

function pasteShares(a, b) {
  let boxes = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(boxes[0], { target: { value: a } });
  boxes = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(boxes[1], { target: { value: b } });
}

// 2026-08-16 audit remediation: PinPad → passphrase input. The restore path
// must not re-wrap with a numeric PIN (see KEK-bypass note in the page).
const NEW_PASSPHRASE = 'restore-passphrase-with-enough-entropy';
function enterPassphraseAndSubmit(pass = NEW_PASSPHRASE) {
  const fields = screen.getAllByPlaceholderText(/new passphrase|confirm new passphrase/i);
  fireEvent.change(fields[0], { target: { value: pass } });
  fireEvent.change(fields[1], { target: { value: pass } });
  fireEvent.click(screen.getByRole('button', { name: /^restore$/i }));
}

describe('RestoreFromShares — encrypted bundle detection', () => {
  it('offers an optional keypad for numeric-only recovery passphrases', async () => {
    const restoreFromRecoveryBundles = vi.fn();
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);

    fireEvent.click(await screen.findByRole('button', { name: /use keypad/i }));
    expect(await screen.findByRole('group', { name: /share 2 recovery passphrase numeric passphrase entry/i })).toBeTruthy();
  });

  it('falls back to keyboard mode once a passphrase is no longer numeric-only', async () => {
    const restoreFromRecoveryBundles = vi.fn();
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);

    fireEvent.click(await screen.findByRole('button', { name: /use keypad/i }));
    expect(await screen.findByRole('group', { name: /share 2 recovery passphrase numeric passphrase entry/i })).toBeTruthy();

    const keypadToggle = screen.getByRole('button', { name: /use keyboard/i });
    fireEvent.click(keypadToggle);
    const passphraseInput = await screen.findByPlaceholderText(/recovery passphrase/i);
    fireEvent.change(passphraseInput, { target: { value: '123456789012345a' } });

    expect(await screen.findByText(/keypad mode is available for numeric-only passphrases/i)).toBeTruthy();
    expect(screen.queryByRole('group', { name: /numeric passphrase entry/i })).toBeNull();
  });

  it('shows a passphrase field once an encrypted bundle is pasted in', async () => {
    const restoreFromRecoveryBundles = vi.fn();
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.queryByPlaceholderText(/recovery passphrase/i)).toBeNull();
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);
    expect(await screen.findByPlaceholderText(/recovery passphrase/i)).toBeTruthy();
  });

  it('unwraps the encrypted share and calls restoreFromRecoveryBundles with the decoded raw bundle', async () => {
    const restoreFromRecoveryBundles = vi.fn(async (/** @type {string[]} */ _bundles) => {});
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);
    fireEvent.change(await screen.findByPlaceholderText(/recovery passphrase/i), {
      target: { value: PASSPHRASE },
    });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    enterPassphraseAndSubmit();

    await waitFor(() => expect(restoreFromRecoveryBundles).toHaveBeenCalled(), { timeout: 15_000 });
    const [bundles] = restoreFromRecoveryBundles.mock.calls[0];
    expect(bundles).toEqual([RAW_BUNDLE_1, RAW_BUNDLE_2]);
  }, 30_000);

  it('surfaces a fail-closed error on a wrong passphrase and never calls restoreFromRecoveryBundles', async () => {
    const restoreFromRecoveryBundles = vi.fn(async () => {});
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);
    fireEvent.change(await screen.findByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'the-wrong-but-long-enough-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    enterPassphraseAndSubmit();

    expect(await screen.findByRole('alert', {}, { timeout: 15_000 })).toBeTruthy();
    expect(restoreFromRecoveryBundles).not.toHaveBeenCalled();
  }, 30_000);

  it('returns to the passphrase step on a wrong passphrase so the user can correct it and retry (Codex P2)', async () => {
    const restoreFromRecoveryBundles = vi.fn(async (/** @type {string[]} */ _bundles) => {});
    const Page = await loadPage(restoreFromRecoveryBundles);
    render(<MemoryRouter><Page /></MemoryRouter>);
    pasteShares(RAW_BUNDLE_1, wrappedBundle2);
    fireEvent.change(await screen.findByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'the-wrong-but-long-enough-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    enterPassphraseAndSubmit();

    // Error shown, and the PIN screen must NOT be where the user is stuck —
    // the passphrase field (only rendered on the input step) must be back
    // and editable.
    expect(await screen.findByRole('alert', {}, { timeout: 15_000 })).toBeTruthy();
    const passphraseInput = await screen.findByPlaceholderText(/recovery passphrase/i);
    expect(passphraseInput).toBeTruthy();
    expect(screen.queryAllByRole('group', { name: /pin entry/i })).toHaveLength(0);

    // Correct the passphrase and retry — should now succeed.
    fireEvent.change(passphraseInput, { target: { value: PASSPHRASE } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    enterPassphraseAndSubmit();

    await waitFor(() => expect(restoreFromRecoveryBundles).toHaveBeenCalled(), { timeout: 15_000 });
    const [bundles] = restoreFromRecoveryBundles.mock.calls[0];
    expect(bundles).toEqual([RAW_BUNDLE_1, RAW_BUNDLE_2]);
  }, 30_000);
});
