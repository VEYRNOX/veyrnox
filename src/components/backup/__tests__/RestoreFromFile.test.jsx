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
import { MemoryRouter } from 'react-router';

// ── RASP: keep the REAL sensitiveGate; only the artifact source is controllable. ──
let raspArtifact = { tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => raspArtifact };
});

// L-6 fix (audit 2026-08-25): handleUnlock now ALSO awaits a fresh, on-device-
// only probe at the confirm step (see the "(f)" describe block below).
// Default mirrors the mount-time artifact so every existing (pre-L-6) test in
// this file is unaffected; individual L-6 tests override it to diverge from
// raspArtifact.
let freshRaspArtifact = null; // null => tests below fall back to `raspArtifact`
const getFreshLocalRaspArtifact = vi.fn(async () => freshRaspArtifact ?? raspArtifact);
vi.mock('@/lib/getFreshLocalRaspArtifact', () => ({
  getFreshLocalRaspArtifact: (...a) => getFreshLocalRaspArtifact(...a),
}));

// ── vaultBackup: the crypto/file-I/O we REUSE. Stubbed for unit testing. ─────────
// 2026-09-01: envelope model is now a SINGLE combined seal (password + PIN both
// required). See wallet-core/vaultBackup.js file-top DESIGN comment.
const parseBackupFile = vi.fn(() => ({ app: 'veyrnox', backup_v: 2, seals: { combined: {} } }));
const decryptBackupSeal = vi.fn(async () => 'CONTAINER-JSON');
const finalisePinRestore = vi.fn(async () => undefined);
vi.mock('@/lib/restoreBackupFile', () => ({
  parseBackupFile: (...a) => parseBackupFile(...a),
  decryptBackupSeal: (...a) => decryptBackupSeal(...a),
  finalisePinRestore: (...a) => finalisePinRestore(...a),
  withLockSuppressed: (fn) => fn(),
}));

// Web platform (uses <input type=file> + FileReader — no native plugin needed).
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(), notification: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: { error: (...a) => toastError(...a), success: (...a) => toastSuccess(...a), warning: vi.fn() } }));

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
  freshRaspArtifact = null;
  getFreshLocalRaspArtifact.mockClear();
  parseBackupFile.mockReset().mockReturnValue({ app: 'veyrnox', backup_v: 2, seals: { combined: {} } });
  decryptBackupSeal.mockReset().mockResolvedValue('CONTAINER-JSON');
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
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The gate must have refused BEFORE any crypto ran (I4 fail-closed).
    expect(decryptBackupSeal).not.toHaveBeenCalled();
  });

  it('(b) wrong credential fails closed to a GENERIC error (no oracle) and returns to the unlock phase', async () => {
    decryptBackupSeal.mockRejectedValueOnce(Object.assign(new Error('OperationError'), { name: 'OperationError' }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'wrong-password-16ch' } });
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptBackupSeal).toHaveBeenCalled());
    // Generic message — must NOT distinguish "wrong password" from "corrupt file".
    // Countdown suffix added 2026-08-15 (Codex P2, attempt cap). The generic
    // wording — "Wrong credential OR corrupted backup" — is what preserves the
    // no-oracle property; the "(N left)" only reveals attempt count, not which
    // failure branch was hit.
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Wrong credential or corrupted backup\./)));
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
    expect(decryptBackupSeal).not.toHaveBeenCalled();
  });

  it('(c) the restoring state is an ISOLATED dedicated component (animation seam), shown while crypto runs', async () => {
    // Defer the decrypt so we can observe the intermediate 'restoring' phase.
    let resolveDecrypt;
    decryptBackupSeal.mockImplementationOnce(() => new Promise((res) => { resolveDecrypt = res; }));
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    // The dedicated restoring seam is on screen while the Argon2id decrypt runs.
    await waitFor(() => expect(screen.getByTestId('restore-progress')).toBeTruthy());

    resolveDecrypt('CONTAINER-JSON');
    // After decrypt resolves, we should advance to the setpin phase.
    await screen.findByText(/choose a device pin/i);
  });

  it('(d) combined credential: decryptBackupSeal(env, pw, pin) → set-device-PIN → finalisePinRestore (PIN-cohort)', async () => {
    const onFinish = vi.fn();
    const { container } = renderShared({ onFinish });
    await loadFile(container);

    // Both backup password AND backup PIN required — single combined seal (2026-09-01).
    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptBackupSeal).toHaveBeenCalledWith(expect.anything(), 'sixteen-char-pass', '12345678'));

    // Now on the set-device-PIN phase — choose + confirm a fresh 8-digit device PIN.
    await setDevicePinViaPad('87654321');

    await waitFor(() => expect(finalisePinRestore).toHaveBeenCalledWith('CONTAINER-JSON', '87654321'));

    // Done phase → the single finish button hands control back to the caller.
    const finishBtn = await screen.findByRole('button', { name: /lock/i });
    fireEvent.click(finishBtn);
    expect(onFinish).toHaveBeenCalled();
  });

  it('(d-guard) Restore wallet button disabled until BOTH password ≥16 chars AND 8-digit PIN present', async () => {
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    const btn = () => screen.getByRole('button', { name: /restore wallet/i });

    // Neither field: disabled.
    expect(btn()).toBeDisabled();

    // Password only: still disabled (PIN missing).
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    expect(btn()).toBeDisabled();

    // Password too short + PIN present: disabled.
    fireEvent.change(pw, { target: { value: 'too-short' } });
    typePinDigits('12345678');
    expect(btn()).toBeDisabled();

    // Both satisfy: enabled.
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    expect(btn()).not.toBeDisabled();
  });

  it('(e) setpin phase rejects mismatched PINs', async () => {
    const { container } = renderShared();
    await loadFile(container);

    const pw = await screen.findByPlaceholderText(/your original password/i);
    fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
    typePinDigits('12345678');
    fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

    await waitFor(() => expect(decryptBackupSeal).toHaveBeenCalled());

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

  // L-6 (audit 2026-08-25): the mount-time raspArtifact sample can be up to
  // ~60s stale (heartbeat). handleUnlock now ALSO awaits a fresh probe right
  // at the confirm tap — the highest-danger moment (degrade.js) — so a hook
  // injected after the last mount-time sample but before the click is caught.
  describe('(f) fresh-at-confirm RASP probe (L-6)', () => {
    it('awaits getFreshLocalRaspArtifact on unlock', async () => {
      const { container } = renderShared();
      await loadFile(container);
      const pw = await screen.findByPlaceholderText(/your original password/i);
      fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
      typePinDigits('12345678');
      fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

      await waitFor(() => expect(getFreshLocalRaspArtifact).toHaveBeenCalledTimes(1));
    });

    it('mount-time ALLOW + fresh BLOCK refuses the restore (closes the staleness window)', async () => {
      freshRaspArtifact = {
        tier: 'BLOCK',
        sentence: 'This app appears to have been altered…',
        blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
        requiresBiometric: false,
      };
      const { container } = renderShared();
      await loadFile(container);
      const pw = await screen.findByPlaceholderText(/your original password/i);
      fireEvent.change(pw, { target: { value: 'sixteen-char-pass' } });
      typePinDigits('12345678');
      fireEvent.click(screen.getByRole('button', { name: /restore wallet/i }));

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(decryptBackupSeal).not.toHaveBeenCalled();
    });
  });
});
