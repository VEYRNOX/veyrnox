// PersonalBackup ExportTab — L-6 fix (audit 2026-08-25).
//
// runExport used to gate ONLY on the mount-time useRaspArtifact() sample (up
// to ~60s stale — heartbeat). This pins that the confirm tap ("Save backup…")
// now ALSO awaits a fresh, on-device-only probe (getFreshLocalRaspArtifact)
// and refuses to build the backup on a BLOCK verdict — even when the
// mount-time sample is still ALLOW, the exact staleness window L-6 closes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const createBackup = vi.fn(async () => ({ env: true }));
const recordMilestone = vi.fn();
const triggerReviewPromptIfEligible = vi.fn(async () => false);
vi.mock('@/lib/reviewPrompt', () => ({
  recordMilestone: () => recordMilestone(),
  triggerReviewPromptIfEligible: () => triggerReviewPromptIfEligible(),
}));
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    createBackup,
    lock: vi.fn(),
    isDecoy: false,
    isHidden: false,
    getBackupPublicAddresses: () => [],
  }),
}));

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), gateModal: null }),
}));

vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'safety_plus', tiers: {}, loading: false, refreshTier: vi.fn() }),
}));

// Mount-time artifact is ALLOW — the case that matters is the FRESH probe
// (mocked separately below) disagreeing with it.
let mountArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
/** @type {any} */
let freshRaspArtifact = null; // null => falls back to mountArtifact
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => mountArtifact };
});

const getFreshLocalRaspArtifact = /** @type {any} */ (vi.fn(async () => freshRaspArtifact ?? mountArtifact));
vi.mock('@/lib/getFreshLocalRaspArtifact', () => ({
  getFreshLocalRaspArtifact: (...a) => getFreshLocalRaspArtifact(...a),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
}));

const verifyBackupEnvelope = /** @type {any} */ (vi.fn(async () => true));
const downloadBackupFile = /** @type {any} */ (vi.fn(async () => ({ saved: true, path: 'Downloaded veyrnox.enc' })));
vi.mock('@/wallet-core/vaultBackup', () => ({
  downloadBackupFile: (...a) => downloadBackupFile(...a),
  downloadBackupFilePicker: vi.fn(),
  verifyBackupEnvelope: (...a) => verifyBackupEnvelope(...a),
}));

vi.mock('@/components/backup/RestoreFromFile', () => ({
  default: () => <div data-testid="restore-from-file-stub" />,
}));

const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: { error: (...a) => toastError(...a), success: vi.fn(), warning: vi.fn(), message: vi.fn() } }));

import PersonalBackup from '@/pages/PersonalBackup';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  mountArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
  freshRaspArtifact = null;
  getFreshLocalRaspArtifact.mockClear();
  createBackup.mockClear();
  toastError.mockClear();
  recordMilestone.mockClear();
  triggerReviewPromptIfEligible.mockClear();
});
afterEach(() => cleanup());

function fillExportForm() {
  // 2026-09-01: password floor bumped 12→16; PIN pinned at exactly 8 digits
  // alongside the single-combined-seal rewrite. See wallet-core/vaultBackup.js
  // file-top DESIGN comment.
  fireEvent.change(screen.getByPlaceholderText(/a new password to protect this backup/i), {
    target: { value: 'a-very-strong-backup-password' }, // 28 chars, over the 16 floor
  });
  const digits = '12345678';
  // PinPad's submit button's accessible name tracks its visible submitLabel
  // (ONB-02/A11Y-01 fix) — "Next" on the choose step, "Confirm" on the
  // confirm step (RestoreFromFile.test.jsx's submitPinPad() drives the same
  // choose→confirm shape with the same two labels).
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
}

describe('PersonalBackup ExportTab — fresh-at-confirm RASP probe (L-6)', () => {
  it('records and prompts only after Yes, I saved it', async () => {
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);
    fillExportForm();
    fireEvent.click(screen.getByRole('button', { name: /save backup/i }));
    const confirm = await screen.findByRole('button', { name: /yes, i saved it/i });
    expect(recordMilestone).not.toHaveBeenCalled();
    expect(triggerReviewPromptIfEligible).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(recordMilestone).toHaveBeenCalledTimes(1);
    expect(triggerReviewPromptIfEligible).toHaveBeenCalledTimes(1);
  });

  it('does not record or prompt after Not yet', async () => {
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);
    fillExportForm();
    fireEvent.click(screen.getByRole('button', { name: /save backup/i }));
    fireEvent.click(await screen.findByRole('button', { name: /not yet/i }));
    expect(recordMilestone).not.toHaveBeenCalled();
    expect(triggerReviewPromptIfEligible).not.toHaveBeenCalled();
  });

  it('awaits getFreshLocalRaspArtifact on export', async () => {
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);
    fillExportForm();
    fireEvent.click(screen.getByRole('button', { name: /save backup/i }));

    await waitFor(() => expect(getFreshLocalRaspArtifact).toHaveBeenCalledTimes(1));
  });

  it('mount-time ALLOW + fresh BLOCK refuses the export (closes the staleness window)', async () => {
    freshRaspArtifact = {
      tier: 'BLOCK',
      sentence: 'Another program appears to be inspecting this app…',
      blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
      requiresBiometric: false,
    };
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);
    fillExportForm();
    fireEvent.click(screen.getByRole('button', { name: /save backup/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('fresh ALLOW proceeds to export as before', async () => {
    render(<MemoryRouter><PersonalBackup /></MemoryRouter>);
    fillExportForm();
    fireEvent.click(screen.getByRole('button', { name: /save backup/i }));

    await waitFor(() => expect(createBackup).toHaveBeenCalled());
  });
});
