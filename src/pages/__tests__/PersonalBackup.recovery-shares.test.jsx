// PersonalBackup — Personal Backup Phase 1 Recovery Shares tab.
//
// Coverage:
//   1. Flag off (default): the tab does not appear in the tab bar at all —
//      dead-code-eliminated visually. Nothing exportRecoveryShares-related
//      is reachable.
//   2. Flag on, decoy session: the tab appears but the panel is suppressed
//      with a neutral notice — matches ExportTab deniability contract (I3).
//   3. Flag on, primary session: the split button drives the WalletProvider
//      helper and reports the saved count on success.
//
// The flag is read at module load from import.meta.env; each test loads a
// fresh copy of shardBackup.js and PersonalBackup.jsx with the desired flag
// stub, so no test leaks its env into another.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// The Recovery Shares tab now drives vault-unlock via PinPad (8 digits), not a
// PasswordInput. Type each digit as a button click; the parent's canExport
// gate flips true once pin.length === 8. TEST_PIN is a valid 8-digit vault PIN
// stand-in that the tests below pass into the exportRecoveryBundles mock.
const TEST_PIN = '13572468';
function typeVaultPin(pin = TEST_PIN) {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
}

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), gateModal: null }),
}));

vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => ({ tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false }) };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(), deleteFile: vi.fn() },
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

vi.mock('@/components/backup/RestoreFromFile', () => ({
  default: () => <div data-testid="restore-from-file-stub" />,
}));

const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: { error: (...a) => toastError(...a), success: vi.fn(), warning: vi.fn() } }));

// createObjectURL / anchor click stubs so the web save path runs in jsdom
beforeEach(() => {
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:stub');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  toastError.mockClear();
  cleanup();
});

async function loadPage({ enableShards, useWalletValue, tier = 'safety_plus', shardExportReady = true, native = false }) {
  if (enableShards) vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { getPlatform: () => (native ? 'ios' : 'web'), isNativePlatform: () => native },
    registerPlugin: vi.fn(() => ({})),
  }));
  vi.doMock('@/lib/WalletProvider', () => ({
    useWallet: () => useWalletValue,
  }));
  vi.doMock('@/lib/hardwareKekStatus', () => ({
    isHardwareKekEnrolled: vi.fn(async () => shardExportReady),
  }));
  // Tier is now consumed inside PersonalBackup — the shard tab renders the
  // export panel for any tier with Safety Plus access, otherwise an upsell.
  // Every existing test in this suite asserts flow-shape behaviour that
  // presumes shards are reachable, so default to Safety Plus; the free-tier
  // upsell path gets its own explicit test below.
  vi.doMock('@/lib/TierProvider', () => ({
    useTier: () => ({ currentTier: tier, tiers: {}, loading: false, refreshTier: vi.fn() }),
  }));
  const mod = await import('@/pages/PersonalBackup');
  return mod.default;
}

describe('PersonalBackup — Recovery Shares tab (flag off)', () => {
  it('does not render the Recovery shares tab when the build flag is off', async () => {
    const Page = await loadPage({
      enableShards: false,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /advanced.*2-of-3/i })).toBeNull();
  });
});

describe('PersonalBackup — Recovery Shares tab (flag on)', () => {
  it('suppresses the panel in a decoy session with a neutral notice (I3)', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: true,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    // Tab exists, so a decoy examiner sees a plausible flow shape.
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    expect(screen.getByText(/unavailable in this session/i)).toBeTruthy();
    // No password field, no split button — no way to trigger the real path.
    expect(screen.queryByPlaceholderText(/wallet password/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /split & save 3 shares/i })).toBeNull();
  });

  it('calls exportRecoveryBundles and reports 3/3 saved on the happy path', async () => {
    // Phase 3 (cross-device restore): CREATE now emits self-contained bundle
    // JSON strings (share bytes + vault ciphertext + hash). saveShareFile
    // receives the UTF-8-encoded bundle, not raw share bytes.
    const fakeBundles = [1, 2, 3].map((n) =>
      JSON.stringify({ v: 1, shareIndex: n, shareBytes: 'AA==', vault: {}, vaultHash: 'x', meta: {} })
    );
    const exportRecoveryBundles = vi.fn(async () => fakeBundles);
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        exportRecoveryBundles,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    typeVaultPin();
    // 2026-08-16 audit round 3: passphrase-wrap is mandatory, no opt-out.
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-nice-and-long-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    // Argon2id wrap × 3 shares is ~seconds; use the same 15s waitFor +
    // 30s test timeout as the "encrypts ALL 3 shares" case below.
    await waitFor(
      () => expect(screen.getByText(/all 3 recovery shares saved/i)).toBeTruthy(),
      { timeout: 15_000 },
    );
    expect(exportRecoveryBundles).toHaveBeenCalledWith(TEST_PIN);
  }, 30_000);

  it('surfaces a fail-closed error when exportRecoveryBundles throws', async () => {
    const exportRecoveryBundles = vi.fn(async () => {
      throw new Error('PERSONAL_BACKUP_ROUND_TRIP_FAILED');
    });
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        exportRecoveryBundles,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    typeVaultPin();
    // 2026-08-16 audit round 3: passphrase-wrap is mandatory.
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-nice-and-long-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    // Success screen must NOT appear on a failure — user sees a toast (mocked
    // globally elsewhere) rather than a false "shares saved" confirmation.
    await waitFor(() => expect(exportRecoveryBundles).toHaveBeenCalled());
    expect(screen.queryByText(/all 3 recovery shares saved/i)).toBeNull();
  });

  it('translates KEK_NO_HARDWARE_FACTOR into an actionable export error', async () => {
    const exportRecoveryBundles = vi.fn(async () => {
      throw Object.assign(new Error('KEK_NO_HARDWARE_FACTOR'), { code: 'KEK_NO_HARDWARE_FACTOR' });
    });
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        exportRecoveryBundles,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    typeVaultPin();
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-nice-and-long-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    await waitFor(() => expect(exportRecoveryBundles).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith(
      'Hardware Protection is already on, but this device did not return the hardware factor for shard export. Try again; if it keeps happening, turn Hardware Protection off and back on in Settings.'
    );
  });

  it('greys out shard export until Hardware Protection is on for the vault', async () => {
    const Page = await loadPage({
      enableShards: true,
      native: true,
      shardExportReady: false,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        exportRecoveryBundles: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    await waitFor(() =>
      expect(screen.getByText(/turn on hardware protection first/i)).toBeTruthy()
    );
    expect(screen.getByText(/biometric re-auth alone is not enough/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /split & save 3 shares/i })).toBeDisabled();
  });
});

describe('PersonalBackup — Export passphrase-wrap (Phase 3, flag on)', () => {
  // 2026-08-16 audit remediation (round 3): the encrypt toggle is REMOVED.
  // Every exported share is wrapped unconditionally; the passphrase input is
  // permanently visible and passphrase entry is required to enable Split.
  it('renders the recovery-passphrase input unconditionally (no toggle)', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    expect(screen.getByPlaceholderText(/recovery passphrase/i)).toBeTruthy();
    // The old opt-out checkbox must not exist any more.
    expect(screen.queryByLabelText(/encrypt each share with a passphrase/i)).toBeNull();
  });

  it('offers an optional keypad for numeric-only export passphrases', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    fireEvent.click(screen.getByRole('button', { name: /use keypad/i }));
    expect(await screen.findByRole('group', { name: /recovery passphrase numeric passphrase entry/i })).toBeTruthy();
  });

  it('falls back to keyboard mode for non-numeric export passphrases', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    fireEvent.click(screen.getByRole('button', { name: /use keypad/i }));
    expect(await screen.findByRole('group', { name: /recovery passphrase numeric passphrase entry/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /use keyboard/i }));
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: '123456789012345a' },
    });
    expect(await screen.findByText(/keypad mode is available for numeric-only passphrases/i)).toBeTruthy();
    expect(screen.queryByRole('group', { name: /numeric passphrase entry/i })).toBeNull();
  });

  it('keeps the Split button disabled until the passphrase meets the length floor', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    typeVaultPin();
    // No passphrase yet — disabled.
    expect(screen.getByRole('button', { name: /split & save 3 shares/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'too-short' },
    });
    expect(screen.getByText(/use at least 16 characters/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /split & save 3 shares/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-nice-and-long-passphrase' },
    });
    expect(screen.getByRole('button', { name: /split & save 3 shares/i }).hasAttribute('disabled')).toBe(false);
  });
});

describe('PersonalBackup — Restore sub-view (Phase 2, flag on)', () => {
  // Restore is a mode INSIDE the Recovery Shares tab. Tests below open that
  // tab first, click Restore, and drive from there.

  function stubRestoreFilePick(buffers) {
    const files = buffers.map(
      (buf, i) => new File([buf], `share${i}.json`, { type: 'application/json' }),
    );
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        Object.defineProperty(this, 'files', { value: files, configurable: true });
        this.onchange && this.onchange(new Event('change'));
      } else {
        origClick.call(this);
      }
    };
    return () => { HTMLInputElement.prototype.click = origClick; };
  }

  it('renders the Restore panel copy when the Restore mode is selected', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    // Two Restore buttons exist once the tab is open — top-level TABS bar and
    // the in-tab mode toggle. Pick the mode toggle inside the sub-panel.
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    expect(screen.getByText(/restore from 2 recovery shares/i)).toBeTruthy();
    // Restore button disabled until 2 files picked AND password entered.
    const submit = screen.getByRole('button', { name: /restore wallet/i });
    expect(submit.hasAttribute('disabled')).toBe(true);
  });

  it('rejects a non-numeric new PIN and keeps Restore disabled (Codex P1 2026-08-09)', async () => {
    // Regression: prior version accepted any non-empty string. Native cohort
    // is PIN-only; a non-numeric value would lock the user out post-restore.
    const restoreFromRecoveryShares = vi.fn();
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    fireEvent.change(screen.getByPlaceholderText("New PIN (digits only)"), {
      target: { value: 'not-numeric' },
    });
    expect(screen.getByText(/enter a numeric pin/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore wallet/i }).hasAttribute('disabled')).toBe(true);
    expect(restoreFromRecoveryShares).not.toHaveBeenCalled();
  });

  it('rejects a short numeric PIN and keeps Restore disabled', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    fireEvent.change(screen.getByPlaceholderText("New PIN (digits only)"), {
      target: { value: '123' },
    });
    expect(screen.getByRole('button', { name: /restore wallet/i }).hasAttribute('disabled')).toBe(true);
  });

  it('disables the Restore button until both shares and a new password are provided', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    // Enter a password with no shares picked — still disabled.
    fireEvent.change(screen.getByPlaceholderText("New PIN (digits only)"), {
      target: { value: '24681024' },
    });
    expect(screen.getByRole('button', { name: /restore wallet/i }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps Restore disabled until the confirm-PIN matches (Codex P2 2026-08-09)', async () => {
    // Regression: prior version re-wrapped vault under a single-entry PIN; a
    // typo silently locked the user out. Now requires matching confirmation.
    const restoreFromRecoveryShares = vi.fn();
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    fireEvent.change(screen.getByPlaceholderText('New PIN (digits only)'), {
      target: { value: '24681024' },
    });
    // Mismatch keeps it disabled + shows error.
    fireEvent.change(screen.getByPlaceholderText(/confirm new pin/i), {
      target: { value: '98765431' },
    });
    expect(screen.getByText(/pins do not match/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore wallet/i }).hasAttribute('disabled')).toBe(true);
    // Match — still disabled because no files picked, but no mismatch error.
    fireEvent.change(screen.getByPlaceholderText(/confirm new pin/i), {
      target: { value: '24681024' },
    });
    expect(screen.queryByText(/pins do not match/i)).toBeNull();
  });

  it('does not show the recovery-passphrase input when both picked files are raw shares', async () => {
    // No files picked yet ⇒ no encrypted count ⇒ no passphrase field.
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);
    expect(screen.queryByPlaceholderText(/recovery passphrase/i)).toBeNull();
  });

  it('offers an optional keypad for numeric-only recovery passphrases in the restore panel', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);

    const restoreFilePick = stubRestoreFilePick([
      new TextEncoder().encode(JSON.stringify({ app: 'veyrnox', type: 'recovery-share', version: 1, shareIndex: 1, kdf: {}, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=' })),
      new TextEncoder().encode('\x02'.repeat(88)),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /choose 2 share files/i }));
    try {
      restoreFilePick();

      fireEvent.click(await screen.findByRole('button', { name: /use keypad/i }));
      expect(await screen.findByRole('group', { name: /recovery passphrase numeric passphrase entry/i })).toBeTruthy();
    } finally {
      restoreFilePick();
    }
  });

  it('falls back to keyboard mode when the recovery passphrase is no longer numeric-only', async () => {
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);

    const restoreFilePick = stubRestoreFilePick([
      new TextEncoder().encode(JSON.stringify({ app: 'veyrnox', type: 'recovery-share', version: 1, kdf: {}, shareIndex: 1, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=' })),
      new TextEncoder().encode('\x02'.repeat(88)),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /choose 2 share files/i }));
    try {
      restoreFilePick();

      fireEvent.click(await screen.findByRole('button', { name: /use keypad/i }));
      expect(await screen.findByRole('group', { name: /recovery passphrase numeric passphrase entry/i })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /use keyboard/i }));
      const passphraseInput = await screen.findByPlaceholderText(/recovery passphrase/i);
      fireEvent.change(passphraseInput, { target: { value: '123456789012345a' } });

      expect(await screen.findByText(/keypad mode is available for numeric-only passphrases/i)).toBeTruthy();
      expect(screen.queryByRole('group', { name: /numeric passphrase entry/i })).toBeNull();
    } finally {
      restoreFilePick();
    }
  });

  it('suppresses the whole tab (export AND restore) in a decoy session', async () => {
    // Sanity: the deniability gate is on the tab root, so both modes are
    // hidden — a decoy examiner cannot even see the Restore UI, let alone
    // trigger it.
    const restoreFromRecoveryShares = vi.fn();
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares,
        lock: vi.fn(),
        isDecoy: true,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    // The tab renders a neutral suppression notice, not a mode toggle.
    expect(screen.getByText(/unavailable in this session/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /restore wallet/i })).toBeNull();
    expect(restoreFromRecoveryShares).not.toHaveBeenCalled();
  });
});

describe('PersonalBackup — every exported share is passphrase-wrapped', () => {
  // History: original bug had checkbox + passphrase wired into UI but never
  // consumed by runSplit (2026-08-15 fix). 2026-08-16 round-2 default-wrapped
  // all 3 shares behind a toggle. Round 3 (this audit) removed the toggle;
  // raw-bundle export is no longer a supported path.
  let savedBlobs;
  let savedNames;
  let origCreateObjectURL;
  let origAnchorClick;

  beforeEach(() => {
    savedBlobs = [];
    savedNames = [];
    origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob) => {
      savedBlobs.push(blob);
      return 'blob:test';
    });
    origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      savedNames.push(this.download);
    };
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    HTMLAnchorElement.prototype.click = origAnchorClick;
  });

  it('encrypts ALL 3 shares under the passphrase (2026-08-16 audit remediation, round 3)', async () => {
    const fakeBundles = [1, 2, 3].map((n) =>
      JSON.stringify({
        v: 1,
        shareIndex: n,
        shareBytes: 'RAWMARKER123==',
        vault: { ct: 'c', salt: 's', iv: 'i', kdf: {} },
        vaultHash: `hash-${n}`,
        meta: {},
      }),
    );
    const exportRecoveryBundles = vi.fn(async () => fakeBundles);
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        exportRecoveryBundles,
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    typeVaultPin();
    // Passphrase is now the only path.
    fireEvent.change(screen.getByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-very-long-recovery-passphrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    await waitFor(() => expect(screen.getByText(/all 3 recovery shares saved/i)).toBeTruthy(), {
      timeout: 15_000,
    });

    expect(savedBlobs).toHaveLength(3);
    const texts = await Promise.all(savedBlobs.map((b) => b.text()));

    // Every share must be a passphrase-wrapped envelope, NOT the raw bundle.
    const { unwrapBundleWithPassphrase } = await import('@/wallet-core/recoveryShare');
    for (let i = 0; i < 3; i++) {
      expect(texts[i]).not.toContain('RAWMARKER123==');
      expect(texts[i]).not.toContain('shareBytes');
      const envelope = JSON.parse(texts[i]);
      expect(envelope.type).toBe('recovery-bundle-v1');
      expect(savedNames[i]).toBe(`veyrnox-recovery-${i + 1}-of-3.veyrnox-recovery.json`);
      const back = await unwrapBundleWithPassphrase(envelope, 'a-very-long-recovery-passphrase');
      expect(new TextDecoder().decode(back)).toBe(fakeBundles[i]);
    }
  }, 30_000);

  // Prior test "saves 3 raw bundles when the user opts out" is REMOVED in
  // 2026-08-16 round-3 remediation: raw-bundle export is no longer a supported
  // path, the opt-out checkbox no longer exists, and the .veyrnox-bundle.json
  // filename suffix is retired.
});

describe('PersonalBackup — same-device restore rejects a cross-device bundle envelope (Codex P2, 2026-08-15)', () => {
  // tryParseRecoveryEnvelope now also matches recovery-bundle-v1 (the
  // cross-device wrap RestoreFromShares.jsx unwraps). This same-device panel
  // must not hand that shape to unwrapShareWithPassphrase — that throws the
  // internal RECOVERY_SHARE_MALFORMED code, not a legible message pointing
  // the user at the flow that actually accepts a bundle envelope.
  function stubFilePick(buffers) {
    const files = buffers.map(
      (buf, i) => new File([buf], `share${i}.json`, { type: 'application/json' }),
    );
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        Object.defineProperty(this, 'files', { value: files, configurable: true });
        this.onchange && this.onchange(new Event('change'));
      } else {
        origClick.call(this);
      }
    };
    return () => { HTMLInputElement.prototype.click = origClick; };
  }

  it('shows a direct bundle-restore CTA instead of throwing RECOVERY_SHARE_MALFORMED', async () => {
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    const { wrapBundleWithPassphrase } = await import('@/wallet-core/recoveryShare');
    const bundleEnvelope = await wrapBundleWithPassphrase(
      new TextEncoder().encode(JSON.stringify({ v: 1, shareIndex: 2 })),
      'a-very-long-recovery-passphrase',
      2,
    );
    const restoreFromRecoveryShares = vi.fn();
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);

    const restoreFilePick = stubFilePick([
      new TextEncoder().encode('\x02'.repeat(88)),
      new TextEncoder().encode(bundleEnvelope),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /choose 2 share files/i }));
    restoreFilePick();

    // encryptedCount currently counts ANY parsed envelope — bundle included —
    // so the passphrase field is required to unlock the Restore button too.
    // Its value is irrelevant here: the fix must reject the bundle envelope
    // BEFORE it ever reaches unwrapShareWithPassphrase.
    fireEvent.change(await screen.findByPlaceholderText(/recovery passphrase/i), {
      target: { value: 'a-very-long-recovery-passphrase' },
    });
    fireEvent.change(screen.getByPlaceholderText('New PIN (digits only)'), {
      target: { value: '24681024' },
    });
    fireEvent.change(screen.getByPlaceholderText(/confirm new pin/i), {
      target: { value: '24681024' },
    });
    expect(await screen.findByText(/cross-device recovery bundles detected/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /open restore from bundles/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore wallet/i })).toBeDisabled();
    expect(toastError).not.toHaveBeenCalled();
    expect(restoreFromRecoveryShares).not.toHaveBeenCalled();
  });

  it('shows a direct CTA to the bundle-restore flow when bundle files are loaded', async () => {
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    const { wrapBundleWithPassphrase } = await import('@/wallet-core/recoveryShare');
    const bundleEnvelope = await wrapBundleWithPassphrase(
      new TextEncoder().encode(JSON.stringify({ v: 1, shareIndex: 2 })),
      'a-very-long-recovery-passphrase',
      2,
    );
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);

    const restoreFilePick = stubFilePick([
      new TextEncoder().encode('\x02'.repeat(88)),
      new TextEncoder().encode(bundleEnvelope),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /choose 2 share files/i }));
    restoreFilePick();

    expect(await screen.findByText(/cross-device recovery bundles detected/i)).toBeTruthy();
    const cta = screen.getByRole('button', { name: /open restore from bundles/i });
    expect(cta).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore wallet/i })).toBeDisabled();
  });
});

describe('PersonalBackup — Advanced tab entitlement (free tier)', () => {
  it('free tier: tab is visible but content is the upsell, not the export panel', async () => {
    const exportRecoveryShares = vi.fn();
    const Page = await loadPage({
      enableShards: true,
      tier: 'free',
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares,
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    // Discovery matters — the tab still shows so free users see the feature exists.
    const tab = screen.getByRole('button', { name: /advanced.*2-of-3/i });
    expect(tab).toBeTruthy();
    fireEvent.click(tab);
    // Upsell renders; export path does NOT.
    expect(screen.getByTestId('shares-tab-upsell')).toBeTruthy();
    expect(screen.getByRole('link', { name: /see safety plus/i })).toHaveAttribute('href', '/plans');
    expect(screen.queryByRole('button', { name: /split & save 3 shares/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/wallet password/i)).toBeNull();
    // No accidental call — the export function must not fire from the upsell.
    expect(exportRecoveryShares).not.toHaveBeenCalled();
  });

  it('safety_plus tier: tab renders the real export panel (regression guard)', async () => {
    const Page = await loadPage({
      enableShards: true,
      tier: 'safety_plus',
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    expect(screen.queryByTestId('shares-tab-upsell')).toBeNull();
    expect(screen.getByRole('button', { name: /split & save 3 shares/i })).toBeTruthy();
  });

  it('ai_security_protection tier: tab also renders the real export panel because it includes Safety Plus', async () => {
    const Page = await loadPage({
      enableShards: true,
      tier: 'ai_security_protection',
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares: vi.fn(),
        restoreFromRecoveryShares: vi.fn(),
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    expect(screen.queryByTestId('shares-tab-upsell')).toBeNull();
    expect(screen.getByRole('button', { name: /split & save 3 shares/i })).toBeTruthy();
  });
});
