// Slice I — Recovery Bay redesign for RestoreFromFile.
//
// Selector contract for the implementer — add these data-testids on the new
// pick-phase layout:
//   • kicker text "RECOVERY BAY" in mono uppercase teal
//   • data-testid="safe-body"
//   • data-testid="safe-door"     (carries the `.vx-animated` class UNLESS
//                                   `prefers-reduced-motion: reduce` matches)
//   • data-testid="safe-dial"
//   • data-testid="safe-handle"
//   • data-testid="safe-glow"
//   • data-testid="restore-dropzone" on the drop target so the drop test
//     doesn't depend on a specific className
//
// The 4 readout steps must match VERBATIM (see plan §Test invariants).
//
// Drop handler contract: onDragOver preventsDefault + adds hover state;
// onDrop reads `dataTransfer.files[0]`, calls the existing envelope handler
// for `.enc`, fails closed for any other extension with the visible error
// "Only .enc backup files are accepted." (no envelope handler dispatched).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => raspArtifact };
});

// parseBackupFile is the "envelope handler" for the drop-path test: dropping a
// .enc must reach it exactly as the click+select path does.
const parseBackupFile = vi.fn(() => ({ app: 'veyrnox', backup_v: 2, seals: { combined: {} } }));
const decryptBackupSeal = vi.fn(async () => 'CONTAINER-JSON');
const finalisePinRestore = vi.fn(async () => undefined);
vi.mock('@/lib/restoreBackupFile', () => ({
  parseBackupFile: (...a) => parseBackupFile(...a),
  decryptBackupSeal: (...a) => decryptBackupSeal(...a),
  finalisePinRestore: (...a) => finalisePinRestore(...a),
  withLockSuppressed: (fn) => fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(), notification: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: { error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a), warning: vi.fn() },
}));

import RestoreFromFile from '@/components/backup/RestoreFromFile';

// The 4 readout steps must render verbatim (plan §Test invariants).
const READOUT_STEPS = [
  'Read your .enc file locally — nothing uploaded.',
  "Unlock with both the file's password and backup PIN.",
  'Set a fresh device PIN for this app.',
  'Replaces any current wallet on this device.',
];

function renderShared(props = {}) {
  return render(
    <MemoryRouter>
      <RestoreFromFile onBack={vi.fn()} onFinish={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

// jsdom's matchMedia stub is settable per-test.
function setReducedMotion(reduced) {
  window.matchMedia = /** @type {any} */ (vi.fn().mockImplementation((query) => ({
    matches: reduced && /prefers-reduced-motion:\s*reduce/i.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

// Fire a synthetic drop carrying a single File via dataTransfer.
function fireDrop(target, file) {
  const dataTransfer = { files: [file], items: file ? [{ kind: 'file', type: file.type }] : [], types: ['Files'] };
  return fireEvent.drop(target, { dataTransfer });
}
function fireDragOverEv(target) {
  let prevented = false;
  const evt = new Event('dragover', { bubbles: true, cancelable: true });
  const orig = evt.preventDefault.bind(evt);
  evt.preventDefault = () => { prevented = true; orig(); };
  target.dispatchEvent(evt);
  return prevented;
}

beforeEach(() => {
  raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
  parseBackupFile.mockReset().mockReturnValue({ app: 'veyrnox', backup_v: 2, seals: { combined: {} } });
  toastError.mockReset();
  toastSuccess.mockReset();
  setReducedMotion(false);
});
afterEach(() => cleanup());

describe('RestoreFromFile — Recovery Bay (Slice I)', () => {
  it('renders the "RECOVERY BAY" kicker', () => {
    renderShared();
    expect(screen.getByText(/RECOVERY BAY/)).toBeTruthy();
  });

  it('renders the animated safe elements (body / door / dial / handle / glow)', () => {
    const { container } = renderShared();
    for (const id of ['safe-body', 'safe-door', 'safe-dial', 'safe-handle', 'safe-glow']) {
      expect(container.querySelector(`[data-testid="${id}"]`)).toBeTruthy();
    }
  });

  it('with prefers-reduced-motion: reduce → safe-door drops the animation class', () => {
    setReducedMotion(true);
    const { container } = renderShared();
    const door = container.querySelector('[data-testid="safe-door"]');
    expect(door).toBeTruthy();
    expect((door.className || '')).not.toMatch(/\bvx-animated\b/);
  });

  it('renders all 4 readout steps verbatim', () => {
    renderShared();
    for (const step of READOUT_STEPS) {
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it('drop of a .enc file calls the envelope handler', async () => {
    const { container } = renderShared();
    const dropzone = container.querySelector('[data-testid="restore-dropzone"]');
    expect(dropzone).toBeTruthy();
    const bytes = new Uint8Array([1, 2, 3]);
    const encFile = new File([bytes], 'veyrnox.enc', { type: 'application/octet-stream' });
    fireDrop(dropzone, encFile);
    // FileReader.readAsArrayBuffer resolves via microtask on jsdom; CI's shared
    // runner sometimes needs a longer wait than a single setTimeout(0) tick.
    // waitFor polls up to 2s, which is deterministic across environments.
    await waitFor(() => expect(parseBackupFile).toHaveBeenCalled(), { timeout: 2000 });
    expect(toastError).not.toHaveBeenCalledWith('Only .enc backup files are accepted.');
  });

  it('drop of a non-.enc file fails closed with the exact rejection message and no envelope call', async () => {
    const { container } = renderShared();
    const dropzone = container.querySelector('[data-testid="restore-dropzone"]');
    const txtFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireDrop(dropzone, txtFile);
    // The rejection is synchronous (extension check before FileReader), so
    // waitFor's first poll should already see the toast; use a short timeout
    // to keep the negative envelope-not-called assertion honest.
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Only .enc backup files are accepted.'), { timeout: 1000 });
    expect(parseBackupFile).not.toHaveBeenCalled();
  });

  it('onDragOver preventsDefault so the browser does not navigate away', () => {
    const { container } = renderShared();
    const dropzone = container.querySelector('[data-testid="restore-dropzone"]');
    const prevented = fireDragOverEv(dropzone);
    expect(prevented).toBe(true);
  });
});
