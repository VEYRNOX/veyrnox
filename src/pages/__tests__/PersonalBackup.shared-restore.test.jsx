// PersonalBackup — regression: the Restore tab renders the SHARED RestoreFromFile
// component (not a duplicated inline RestoreTab). This pins that the extraction did
// not leave PersonalBackup on its own private copy of the restore flow.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    createBackup: vi.fn(async () => ({})),
    lock: vi.fn(),
    isDecoy: false,
    isHidden: false,
  }),
}));

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

// Stub the shared component so the assertion is purely "PersonalBackup delegates to it".
vi.mock('@/components/backup/RestoreFromFile', () => ({
  default: () => <div data-testid="restore-from-file-stub" />,
}));

import PersonalBackup from '@/pages/PersonalBackup';

beforeEach(() => { try { localStorage.clear(); } catch { /* shimmed */ } });
afterEach(() => cleanup());

describe('PersonalBackup — Restore tab uses the shared RestoreFromFile', () => {
  it('renders the shared restore component when the Restore tab is selected', async () => {
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);

    // Switch to the Restore tab.
    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }));

    await waitFor(() => expect(screen.getByTestId('restore-from-file-stub')).toBeTruthy());
  });
});
