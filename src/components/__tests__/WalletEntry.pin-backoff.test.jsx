// WalletEntry — the PIN timed backoff is ENFORCED (M-7) and the attempt counter
// keeps a session floor when localStorage is unwritable (M-9). Audit 2026-08-25.
//
// M-7 was a documented, unit-tested control that did not exist at runtime:
// runPinUnlock destructured `backoffMs` away, PIN_BACKOFF_KEY was cleared but
// never written, and panic.js swept a residue key nothing produced. A wallet
// that claims a 5-minute lockout it does not have is the dishonest option (I4),
// so the control is wired rather than deleted.
//
// M-9: both localStorage accesses swallowed their exception with no floor and no
// signal, so an unwritable store meant every miss read 0 — unlimited attempts and
// shouldWipe never true. The floor is session-scoped, NOT persistence: it stops a
// failed write from resetting progress within a session, and the degraded state
// is surfaced instead of failing open in silence.
//
// Assertions are STRUCTURAL: whether unlock() was reached, what the stored keys
// hold, and the session floor's numbers — never the surrounding prose.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

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
import { pinSessionFloor, clearPinSessionFloor } from '@/lib/pinAttemptGuard';
import WalletEntry from '@/components/WalletEntry';

const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';
const PIN_BACKOFF_KEY = 'veyrnox-pin-backoff-until';

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

function enterPin(pin = '13572468') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));
}

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

const wrongPin = () => vi.fn(async () => { throw new Error('GCM decrypt failed'); });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  clearPinSessionFloor();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); cleanup(); });

describe('WalletEntry — the PIN timed backoff is enforced (M-7)', () => {
  it('persists a deadline on the miss that earns one, then REFUSES the next submission', async () => {
    localStorage.setItem(PIN_ATTEMPTS_KEY, '6'); // next miss is attempt 7 -> 5 min tier
    const ctx = makeCtx({ unlock: wrongPin() });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    enterPin();
    await waitFor(() => expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBe('7'));
    const until = Number(localStorage.getItem(PIN_BACKOFF_KEY));
    expect(until).toBeGreaterThan(Date.now());

    // The lockout must gate the SUBMISSION, not merely decorate the error: the
    // KDF is never spent and the counter does not move.
    enterPin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
    expect(ctx.unlock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBe('7');
  });

  it('lets the submission through once the deadline has passed', async () => {
    localStorage.setItem(PIN_ATTEMPTS_KEY, '7');
    localStorage.setItem(PIN_BACKOFF_KEY, String(Date.now() - 1000)); // expired
    const ctx = makeCtx({ unlock: wrongPin() });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledTimes(1));
  });

  it('clears the deadline (and the session floor) on a successful unlock', async () => {
    localStorage.setItem(PIN_ATTEMPTS_KEY, '5');
    localStorage.setItem(PIN_BACKOFF_KEY, String(Date.now() - 1000)); // expired
    const ctx = makeCtx(); // unlock resolves
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    enterPin();

    await waitFor(() => expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull());
    expect(localStorage.getItem(PIN_BACKOFF_KEY)).toBeNull();
    expect(pinSessionFloor().attempts).toBe(0);
  });
});

describe('WalletEntry — the attempt counter keeps a session floor (M-9)', () => {
  it('does not restart at 1 when the store cannot be written', async () => {
    // Stub the WHOLE storage object rather than spying on one instance's method.
    // An instance spy is not portable: it patches the object this file happened to
    // resolve, and CI resolved a different one — the simulated write failure never
    // occurred, a real "2" landed, and the test failed on its own premise.
    // A Map-backed fake makes the unwritable-store condition deterministic.
    const backing = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (backing.has(String(k)) ? backing.get(String(k)) : null),
      setItem: (k, v) => {
        if (k === PIN_ATTEMPTS_KEY || k === PIN_BACKOFF_KEY) throw new Error('QuotaExceeded');
        backing.set(String(k), String(v));
      },
      removeItem: (k) => { backing.delete(String(k)); },
      clear: () => { backing.clear(); },
      key: (i) => Array.from(backing.keys())[i] ?? null,
      get length() { return backing.size; },
    });

    const ctx = makeCtx({ unlock: wrongPin() });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    enterPin();
    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pinSessionFloor().attempts).toBe(1));

    enterPin();
    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledTimes(2));
    // Nothing was persisted, so a floorless counter would read 0 and re-register
    // as attempt 1 forever — the fail-open the finding describes.
    await waitFor(() => expect(pinSessionFloor().attempts).toBe(2));
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(pinSessionFloor().storageDegraded).toBe(true);
  });
});
