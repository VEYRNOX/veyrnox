// WalletEntry — hardware-KEK error codes must NOT count toward the wrong-PIN wipe.
//
// DATA-LOSS BUG (I4). When a user changes their fingerprints / removes the screen lock
// on Android after enabling Hardware Protection, the AndroidKeyStore HMAC key is
// permanently invalidated. Every unlock retry threw a raw bridge error → runPinUnlock's
// catch fell through to the wrong-PIN counter → 10 retries → irreversible panic wipe,
// with only "Incorrect PIN. Try again." shown and no recovery path.
//
// After the fix, getHardwareFactor classifies the bridge rejection into a stable code
// (KEK_ERR.KEY_PERMANENTLY_INVALIDATED / KEK_ERR.NO_HARDWARE_FACTOR). runPinUnlock must:
//   - KEY_PERMANENTLY_INVALIDATED → NOT increment the counter, auto-route to seed recovery
//   - NO_HARDWARE_FACTOR          → NOT increment the counter, show error, stay on unlock
//
// We assert STRUCTURE (the persisted counter + the rendered recovery view), never copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', async (orig) => {
  const real = await orig();
  return { ...real, getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() };
});
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: '', mode: 'none' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => true) }));

import { useWallet } from '@/lib/WalletProvider';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import WalletEntry from '@/components/WalletEntry';

const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(async () => ({ ok: true })),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(async () => true), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

async function enterPin(pin = '13572468') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));
}

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — hardware-KEK errors are exempt from the wrong-PIN wipe counter', () => {
  it('KEY_PERMANENTLY_INVALIDATED: does NOT increment the counter, does NOT wipe, routes to seed recovery', async () => {
    const err = Object.assign(new Error('x'), { code: KEK_ERR.KEY_PERMANENTLY_INVALIDATED });
    const ctx = makeCtx({ unlock: vi.fn(async () => { throw err; }) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    // Auto-routed to the seed-recovery view.
    await waitFor(() => expect(screen.getByText(/Restore from your seed phrase/i)).toBeTruthy());
    // Counter never touched → cannot march toward the wipe.
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(ctx.panicWipe).not.toHaveBeenCalled();
  });

  it('NO_HARDWARE_FACTOR: does NOT increment the counter, does NOT wipe, stays on the unlock screen', async () => {
    const err = Object.assign(new Error('x'), { code: KEK_ERR.NO_HARDWARE_FACTOR });
    const ctx = makeCtx({ unlock: vi.fn(async () => { throw err; }) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    // Still on the unlock screen (not routed away).
    expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy();
    expect(screen.queryByText(/Restore from your seed phrase/i)).toBeNull();
    // Counter never touched.
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(ctx.panicWipe).not.toHaveBeenCalled();
  });

  it('USER_CANCELLED: does NOT increment the counter, does NOT wipe, stays on the unlock screen', async () => {
    const err = Object.assign(new Error('x'), { code: KEK_ERR.USER_CANCELLED });
    const ctx = makeCtx({ unlock: vi.fn(async () => { throw err; }) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    // Still on the unlock screen (not routed to seed recovery).
    expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy();
    expect(screen.queryByText(/Restore from your seed phrase/i)).toBeNull();
    // Counter never touched → a repeated cancel cannot reach the panic wipe.
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(ctx.panicWipe).not.toHaveBeenCalled();
  });

  it('a genuine wrong PIN STILL increments the counter (surgical exemption)', async () => {
    const ctx = makeCtx({ unlock: vi.fn(async () => { throw new Error('GCM decrypt failed'); }) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBe('1'));
  });
});
