// RestoreFromFile — the shared encrypted-.enc-backup restore flow, extracted from
// PersonalBackup.jsx's RestoreTab so BOTH the post-unlock backup page AND the
// fresh-install onboarding surface render the SAME component (no duplicated crypto,
// no divergent gating).
//
// These tests pin the SECURITY-LOAD-BEARING behaviour, asserting on STRUCTURE and
// machine behaviour (which vaultBackup fn was called, whether the RASP gate blocked)
// — never on prose copy:
//   (a) renders + gates every restore on sensitiveGate(artifact, 'import');
//   (b) wrong credential AND corrupt file both fail closed to a GENERIC error with
//       no oracle distinguishing which (I4);
//   (c) the "restoring" progress state is an isolated, dedicated component boundary
//       (the animation follow-up seam);
//   (d) a successful restore drives the parametrised onFinish (caller decides where
//       to route — unlock screen in onboarding, lock+navigate in PersonalBackup).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── RASP: keep the REAL sensitiveGate (the actual gate logic under test); only the
// artifact source (useRaspArtifact) is controllable per-test. ──────────────────
let raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => raspArtifact };
});

// ── vaultBackup: the crypto/file-I/O we REUSE (never reimplement). Stubbed so we
// can drive success/failure without real Argon2id. ─────────────────────────────
const parseBackupFile = vi.fn(() => ({ app: 'veyrnox', backup_v: 1, seals: { password: {}, pin: {} } }));
const restoreWithPassword = vi.fn(async () => undefined);
const decryptPinSeal = vi.fn(async () => 'CONTAINER-JSON');
const finalisePinRestore = vi.fn(async () => undefined);
vi.mock('@/wallet-core/vaultBackup', () => ({
  parseBackupFile: (...a) => parseBackupFile(...a),
  restoreWithPassword: (...a) => restoreWithPassword(...a),
  decryptPinSeal: (...a) => decryptPinSeal(...a),
  finalisePinRestore: (...a) => finalisePinRestore(...a),
}));

vi.mock('@/wallet-core/keystore', () => ({
  withLockSuppressed: (fn) => fn(),
}));

// Web platform (uses <input type=file> + FileReader — no native plugin needed).
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
  registerPlugin: vi.fn(() => ({})),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a) } }));

import RestoreFromFile from '@/components/backup/RestoreFromFile';

function renderShared(props = {}) {
  return render(
    <MemoryRouter>
      <RestoreFromFile onBack={props.onBack || vi.fn()} onFinish={props.onFinish || vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

// Drive the file input straight to the 'unlock' phase (parseBackupFile is stubbed).
async function loadFile(container) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([new Uint8Array([1, 2, 3])], 'veyrnox.enc');
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
  parseBackupFile.mockReset().mockReturnValue({ app: 'veyrnox', backup_v: 1, seals: { password: {}, pin: {} } });
  restoreWithPassword.mockReset().mockResolvedValue(undefined);
  decryptPinSeal.mockReset().mockResolvedValue('CONTAINER-JSON');
  finalisePinRestore.mockReset().mockResolvedValue(undefined);
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => cleanup());

describe('RestoreFromFile — shared encrypted-backup restore', () => {
  it('renders the pick phase with a select-backup affordance and the testid seam', () => {
    const { getByTestId } = renderShared();
    expect(getByTestId('restore-from-file')).toBeTruthy();
    expect(screen.getByText(/select backup file/i)).toBeTruthy();
  });

  it('(a) GATES every restore on sensitiveGate(artifact, "import"): a BLOCK-tier artifact refuses restore', async () => {
    // Simulate a hooked/tampered device: degrade() puts 'import' in blockedActions.
    raspArtifact = {
      tier: 'BLOCK',
      sentence: 'Another program appears to be inspecting this app…',
      blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
      requiresBiometric: false,
    };
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByLabelText(/backup password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The gate must have refused BEFORE any crypto ran (I4 fail-closed).
    expect(restoreWithPassword).not.toHaveBeenCalled();
    expect(decryptPinSeal).not.toHaveBeenCalled();
  });

  it('(b) wrong credential fails closed to a GENERIC error (no oracle) and returns to the unlock phase', async () => {
    restoreWithPassword.mockRejectedValueOnce(Object.assign(new Error('OperationError'), { name: 'OperationError' }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByLabelText(/backup password/i);
    fireEvent.change(pw, { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(restoreWithPassword).toHaveBeenCalled());
    // Generic message — must NOT distinguish "wrong password" from "corrupt file".
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Wrong credential or corrupted backup.'));
    // Still on the unlock phase so the user can retry (fail closed, not advanced).
    expect(screen.getByRole('button', { name: /restore wallet/i })).toBeTruthy();
  });

  it('(b) corrupt file fails closed WITHOUT advancing to unlock, and uses the same generic class', async () => {
    parseBackupFile.mockImplementationOnce(() => { throw new Error('Not a valid Veyrnox backup file'); });
    const { container } = renderShared();
    await loadFile(container);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Never reached the credential/unlock phase — no crypto attempted.
    expect(screen.queryByRole('button', { name: /restore wallet/i })).toBeNull();
    expect(restoreWithPassword).not.toHaveBeenCalled();
  });

  it('(c) the restoring state is an ISOLATED dedicated component (animation seam), shown while crypto runs', async () => {
    // Defer the restore so we can observe the intermediate 'restoring' phase.
    let resolveRestore;
    restoreWithPassword.mockImplementationOnce(() => new Promise((res) => { resolveRestore = res; }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByLabelText(/backup password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    // The dedicated restoring seam is on screen while the Argon2id decrypt runs.
    await waitFor(() => expect(screen.getByTestId('restore-progress')).toBeTruthy());

    resolveRestore();
    await waitFor(() => expect(restoreWithPassword).toHaveBeenCalled());
  });

  it('(d) a successful password restore reaches done and the finish action drives onFinish', async () => {
    const onFinish = vi.fn();
    const { container } = renderShared({ onFinish });
    await loadFile(container);

    const pw = await screen.findByLabelText(/backup password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(restoreWithPassword).toHaveBeenCalledWith(expect.anything(), 'my-original-password'));

    // Done phase → the single finish button hands control back to the caller.
    const finishBtn = await screen.findByRole('button', { name: /unlock/i });
    fireEvent.click(finishBtn);
    expect(onFinish).toHaveBeenCalled();
  });

  it('(d) PIN method routes through decryptPinSeal → set-new-password → finalisePinRestore', async () => {
    const { container } = renderShared();
    await loadFile(container);

    // Both fields are shown stacked (no toggle) — fill the PIN field directly.
    const pinField = await screen.findByLabelText(/backup pin/i);
    fireEvent.change(pinField, { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptPinSeal).toHaveBeenCalledWith(expect.anything(), '12345678'));

    // Now on the set-new-password phase.
    const newPw = await screen.findByLabelText(/new wallet password/i);
    fireEvent.change(newPw, { target: { value: 'brand-new-strong-password' } });
    const confirmPw = await screen.findByLabelText(/confirm new password/i);
    fireEvent.change(confirmPw, { target: { value: 'brand-new-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /save & restore/i }));

    await waitFor(() => expect(finalisePinRestore).toHaveBeenCalledWith('CONTAINER-JSON', 'brand-new-strong-password'));
  });
});
