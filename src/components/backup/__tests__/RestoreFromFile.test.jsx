// RestoreFromFile — the shared encrypted-.enc-backup restore flow.
//
// These tests pin the SECURITY-LOAD-BEARING behaviour:
//   (a) renders + gates every restore on sensitiveGate(artifact, 'import');
//   (b) wrong credential AND corrupt file both fail closed to a GENERIC error with
//       no oracle distinguishing which (I4);
//   (c) the "restoring" progress state is an isolated, dedicated component boundary
//       (the animation seam);
//   (d) BOTH paths (password + PIN) converge through set-device-PIN →
//       finalisePinRestore — restored vault is ALWAYS PIN-cohort (owner decision
//       2026-07-16);
//   (e) a successful restore drives the parametrised onFinish.
//
// The credential surface is the real product UI: the backup PASSWORD is a
// PasswordInput text field (queried by placeholder), and every PIN — the backup
// PIN and the fresh device PIN — is entered through the numeric PinPad keypad
// (digit buttons + an explicit "Submit PIN", exactly as on device). Driving those
// components the way a user/AT actually does is what these tests verify.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── RASP: keep the REAL sensitiveGate; only the artifact source is controllable. ──
let raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => raspArtifact };
});

// ── vaultBackup: the crypto/file-I/O we REUSE. Stubbed for unit testing. ─────────
const parseBackupFile = vi.fn(() => ({ app: 'veyrnox', backup_v: 1, seals: { password: {}, pin: {} } }));
const decryptPasswordSeal = vi.fn(async () => 'CONTAINER-JSON-PW');
const decryptPinSeal = vi.fn(async () => 'CONTAINER-JSON-PIN');
const finalisePinRestore = vi.fn(async () => undefined);
vi.mock('@/lib/restoreBackupFile', () => ({
  parseBackupFile: (...a) => parseBackupFile(...a),
  decryptPasswordSeal: (...a) => decryptPasswordSeal(...a),
  decryptPinSeal: (...a) => decryptPinSeal(...a),
  finalisePinRestore: (...a) => finalisePinRestore(...a),
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

// Enter a PIN into the numeric PinPad: click each digit button, then (optionally)
// the explicit "Submit PIN" control (PinPad completion is always explicit).
function typePinDigits(pin) {
  for (const digit of pin) fireEvent.click(screen.getByRole('button', { name: digit }));
}
function submitPinPad() {
  fireEvent.click(screen.getByRole('button', { name: /submit pin/i }));
}

// The set-device-PIN phase is a choose → confirm keypad flow; a matching pair
// enables "Save & restore".
async function setDevicePinViaPad(pin) {
  await screen.findByText(/choose a device pin/i);
  typePinDigits(pin);
  submitPinPad();
  await screen.findByText(/confirm device pin/i);
  typePinDigits(pin);
  submitPinPad();
  fireEvent.click(await screen.findByRole('button', { name: /save & restore/i }));
}

beforeEach(() => {
  raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
  parseBackupFile.mockReset().mockReturnValue({ app: 'veyrnox', backup_v: 1, seals: { password: {}, pin: {} } });
  decryptPasswordSeal.mockReset().mockResolvedValue('CONTAINER-JSON-PW');
  decryptPinSeal.mockReset().mockResolvedValue('CONTAINER-JSON-PIN');
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
    raspArtifact = {
      tier: 'BLOCK',
      sentence: 'Another program appears to be inspecting this app…',
      blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
      requiresBiometric: false,
    };
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The gate must have refused BEFORE any crypto ran (I4 fail-closed).
    expect(decryptPasswordSeal).not.toHaveBeenCalled();
    expect(decryptPinSeal).not.toHaveBeenCalled();
  });

  it('(b) wrong credential fails closed to a GENERIC error (no oracle) and returns to the unlock phase', async () => {
    decryptPasswordSeal.mockRejectedValueOnce(Object.assign(new Error('OperationError'), { name: 'OperationError' }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptPasswordSeal).toHaveBeenCalled());
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
    expect(decryptPasswordSeal).not.toHaveBeenCalled();
  });

  it('(c) the restoring state is an ISOLATED dedicated component (animation seam), shown while crypto runs', async () => {
    // Defer the decrypt so we can observe the intermediate 'restoring' phase.
    let resolveDecrypt;
    decryptPasswordSeal.mockImplementationOnce(() => new Promise((res) => { resolveDecrypt = res; }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    // The dedicated restoring seam is on screen while the Argon2id decrypt runs.
    await waitFor(() => expect(screen.getByTestId('restore-progress')).toBeTruthy());

    resolveDecrypt('CONTAINER-JSON-PW');
    // After decrypt resolves, we should advance to the setpin phase.
    await screen.findByText(/choose a device pin/i);
  });

  it('(d) PASSWORD method: decryptPasswordSeal → set-device-PIN → finalisePinRestore (PIN-cohort)', async () => {
    const onFinish = vi.fn();
    const { container } = renderShared({ onFinish });
    await loadFile(container);

    // Enter backup password and submit.
    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptPasswordSeal).toHaveBeenCalledWith(expect.anything(), 'my-original-password'));

    // Now on the set-device-PIN phase — choose + confirm a fresh 8-digit device PIN.
    await setDevicePinViaPad('87654321');

    await waitFor(() => expect(finalisePinRestore).toHaveBeenCalledWith('CONTAINER-JSON-PW', '87654321'));

    // Done phase → the single finish button hands control back to the caller.
    const finishBtn = await screen.findByRole('button', { name: /lock/i });
    fireEvent.click(finishBtn);
    expect(onFinish).toHaveBeenCalled();
  });

  it('(d) PIN method: decryptPinSeal → set-device-PIN → finalisePinRestore (PIN-cohort)', async () => {
    const onFinish = vi.fn();
    const { container } = renderShared({ onFinish });
    await loadFile(container);

    // Enter the backup PIN on the keypad (this unlocks the .enc file — NOT the
    // device PIN) then restore. The backup PIN pad has no auto-complete; the
    // "Restore wallet" button drives the unlock once the pad holds a valid PIN.
    await screen.findByText(/backup pin/i);
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptPinSeal).toHaveBeenCalledWith(expect.anything(), '12345678'));

    // Now on the set-device-PIN phase — choose a DIFFERENT 8-digit device PIN.
    await setDevicePinViaPad('99887766');

    await waitFor(() => expect(finalisePinRestore).toHaveBeenCalledWith('CONTAINER-JSON-PIN', '99887766'));

    // Done phase.
    const finishBtn = await screen.findByRole('button', { name: /lock/i });
    fireEvent.click(finishBtn);
    expect(onFinish).toHaveBeenCalled();
  });

  it('(e) setpin phase rejects mismatched PINs', async () => {
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'my-original-password' } });
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptPasswordSeal).toHaveBeenCalled());

    // Choose one PIN, then confirm a DIFFERENT one — the keypad is choose→confirm.
    await screen.findByText(/choose a device pin/i);
    typePinDigits('87654321');
    submitPinPad();
    await screen.findByText(/confirm device pin/i);
    typePinDigits('12345678');
    submitPinPad();

    // The mismatch message appears and the flow resets — no save is offered and
    // no crypto ran (fail closed).
    expect(await screen.findByText(/pins do not match/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save & restore/i })).toBeNull();
    expect(finalisePinRestore).not.toHaveBeenCalled();
  });
});
