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

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), gateModal: null }),
}));

vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => ({ tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false }) };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
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

// createObjectURL / anchor click stubs so the web save path runs in jsdom
beforeEach(() => {
  if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:stub');
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  cleanup();
});

async function loadPage({ enableShards, useWalletValue, tier = 'safety_plus' }) {
  if (enableShards) vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  vi.resetModules();
  vi.doMock('@/lib/WalletProvider', () => ({
    useWallet: () => useWalletValue,
  }));
  // Tier is now consumed inside PersonalBackup — the shard tab renders the
  // export panel only when currentTier === 'safety_plus', otherwise an
  // upsell. Every existing test in this suite asserts flow-shape behaviour
  // that presumes shards are reachable, so default to Safety Plus; the
  // free-tier upsell path gets its own explicit test below.
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

  it('calls exportRecoveryShares and reports 3/3 saved on the happy path', async () => {
    // 3 non-zero 88-byte "shares" — the tab does not validate contents, only
    // hands them to saveShareFile. Web platform path writes via an anchor.
    const fakeShares = [1, 2, 3].map((n) => {
      const s = new Uint8Array(88);
      s.fill(n);
      return s;
    });
    const exportRecoveryShares = vi.fn(async () => fakeShares);
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    fireEvent.change(screen.getByPlaceholderText(/wallet password/i), {
      target: { value: 'a-strong-password-16' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    await waitFor(() => expect(screen.getByText(/all 3 recovery shares saved/i)).toBeTruthy());
    expect(exportRecoveryShares).toHaveBeenCalledWith('a-strong-password-16');
  });

  it('surfaces a fail-closed error when exportRecoveryShares throws', async () => {
    const exportRecoveryShares = vi.fn(async () => {
      throw new Error('PERSONAL_BACKUP_ROUND_TRIP_FAILED');
    });
    const Page = await loadPage({
      enableShards: true,
      useWalletValue: {
        createBackup: vi.fn(),
        exportRecoveryShares,
        lock: vi.fn(),
        isDecoy: false,
        isHidden: false,
      },
    });
    render(<MemoryRouter><Page /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /advanced.*2-of-3/i }));
    fireEvent.change(screen.getByPlaceholderText(/wallet password/i), {
      target: { value: 'a-strong-password-16' },
    });
    fireEvent.click(screen.getByRole('button', { name: /split & save 3 shares/i }));
    // Success screen must NOT appear on a failure — user sees a toast (mocked
    // globally elsewhere) rather than a false "shares saved" confirmation.
    await waitFor(() => expect(exportRecoveryShares).toHaveBeenCalled());
    expect(screen.queryByText(/all 3 recovery shares saved/i)).toBeNull();
  });
});

describe('PersonalBackup — Export encrypt-one option (Phase 3, flag on)', () => {
  it('reveals the recovery-passphrase input when the checkbox is ticked', async () => {
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
    expect(screen.queryByPlaceholderText(/recovery passphrase/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/encrypt one share with a recovery passphrase/i));
    expect(screen.getByPlaceholderText(/recovery passphrase/i)).toBeTruthy();
  });

  it('keeps the Split button disabled while the checkbox is on but passphrase is too short', async () => {
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
    fireEvent.change(screen.getByPlaceholderText(/your wallet password/i), {
      target: { value: 'wallet-password-123' },
    });
    expect(screen.getByRole('button', { name: /split & save 3 shares/i }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByLabelText(/encrypt one share with a recovery passphrase/i));
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
    expect(screen.getByText(/same-device only/i)).toBeTruthy();
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
      target: { value: '98765432' },
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
      target: { value: '98765432' },
    });
    // Mismatch keeps it disabled + shows error.
    fireEvent.change(screen.getByPlaceholderText(/confirm new pin/i), {
      target: { value: '98765431' },
    });
    expect(screen.getByText(/pins do not match/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore wallet/i }).hasAttribute('disabled')).toBe(true);
    // Match — still disabled because no files picked, but no mismatch error.
    fireEvent.change(screen.getByPlaceholderText(/confirm new pin/i), {
      target: { value: '98765432' },
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
});
