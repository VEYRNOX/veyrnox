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

async function loadPage({ enableShards, useWalletValue }) {
  if (enableShards) vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  vi.resetModules();
  vi.doMock('@/lib/WalletProvider', () => ({
    useWallet: () => useWalletValue,
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
    expect(screen.queryByRole('button', { name: /recovery shares/i })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /recovery shares/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /recovery shares/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /recovery shares/i }));
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
