// WalletEntry — a Theft Protection failure must NOT count toward the wrong-PIN wipe (#2515).
//
// DATA-LOSS BUG (I4). runTheftProtectionGate runs inside WalletProvider.unlock() AFTER
// the PIN has already decrypted the vault. Its TheftProtectionError carried neither
// isBiometricGateError nor isPasskeyGateError nor a KEK_UI_ERR code, so runPinUnlock's
// catch fell through to registerFailedPinAttempt: "Incorrect PIN" for a correct PIN,
// and the tenth consecutive refusal fired the irreversible panic wipe. A RASP WARN on
// genuine hardware, a Face ID cancel, a Touch-ID iPhone or any web build was enough.
//
// Same class as WalletEntry.kek-invalidated.test.jsx. We assert STRUCTURE (the
// persisted counter, the panicWipe / clearUnlockSecret spies, the shared message map),
// never literal copy.

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
  setBiometricUnlockEnabled: vi.fn(() => {}),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: '', mode: 'none' })),
  hasBiometricConsentBeenRecorded: vi.fn(() => true),
  verifyBiometric2fa: vi.fn(),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => true) }));

import { useWallet } from '@/lib/WalletProvider';
import { isBiometricUnlockEnabled, getBiometricStatus } from '@/lib/biometric';
import { hasStoredUnlockSecret, clearUnlockSecret } from '@/lib/biometricUnlock';
import { TheftProtectionError, THEFT_PROTECTION_MESSAGES } from '@/lib/theftProtection';
import { clearPinSessionFloor } from '@/lib/pinAttemptGuard';
import WalletEntry from '@/components/WalletEntry';

const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(async () => ({ ok: true })),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(async () => true),
    unlockWithBiometric: vi.fn(async () => ({ ok: true })),
    unlockBiometricOnly: vi.fn(async () => ({ ok: false, fallbackToPin: true, code: 'FASTPATH_MISS' })),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

async function waitForIdlePad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
  await waitFor(() => expect(screen.getByRole('button', { name: '1' })).not.toBeDisabled());
}

function enterPin(pin = '13572468') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));
}

beforeEach(() => {
  vi.mocked(isBiometricUnlockEnabled).mockReturnValue(false);
  vi.mocked(getBiometricStatus).mockResolvedValue({ available: false, label: '', mode: 'none' });
  vi.mocked(hasStoredUnlockSecret).mockReset().mockResolvedValue(false);
  vi.mocked(clearUnlockSecret).mockClear();
  // pinAttemptGuard keeps a module-level session floor (M-9) that outlives
  // localStorage.clear(); without this a counted miss in one test leaves a backoff
  // that silently skips unlock() in the next.
  clearPinSessionFloor();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — runPinUnlock: Theft Protection is exempt from the wrong-PIN wipe (#2515)', () => {
  it('ten consecutive refusals after a correct PIN: counter untouched, no wipe, no "Incorrect PIN"', async () => {
    const ctx = makeCtx({
      unlock: vi.fn(async () => { throw new TheftProtectionError('rasp-blocked'); }),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // PIN_WIPE_AFTER is 10: the tenth counted miss is the one that wipes.
    for (let i = 1; i <= 10; i += 1) {
      await waitForIdlePad();
      enterPin();
      await waitFor(() => expect(ctx.unlock).toHaveBeenCalledTimes(i));
    }
    await waitForIdlePad();

    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(ctx.panicWipe).not.toHaveBeenCalled();
    expect(screen.getByText(THEFT_PROTECTION_MESSAGES['rasp-blocked'])).toBeTruthy();
    expect(screen.queryByText(/Incorrect PIN/i)).toBeNull();
  });

  it('a genuine wrong PIN STILL increments the counter (surgical exemption)', async () => {
    const ctx = makeCtx({ unlock: vi.fn(async () => { throw new Error('GCM decrypt failed'); }) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForIdlePad();
    enterPin();

    await waitFor(() => expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBe('1'));
  });
});

describe('WalletEntry — handleBiometricUnlock: Theft Protection is not a stale cache (#2515)', () => {
  beforeEach(() => {
    vi.mocked(isBiometricUnlockEnabled).mockReturnValue(true);
    vi.mocked(getBiometricStatus).mockResolvedValue({ available: true, label: 'Face ID', mode: 'native' });
    vi.mocked(hasStoredUnlockSecret).mockResolvedValue(true);
  });

  it('keeps the biometric-unlock cache and renders the Theft Protection message', async () => {
    const ctx = makeCtx({
      unlockWithBiometric: vi.fn(async () => { throw new TheftProtectionError('declined'); }),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // The lock screen auto-prompts on mount; the cached secret opened the vault and
    // the gate refused afterwards.
    await waitFor(() => expect(ctx.unlockWithBiometric).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(THEFT_PROTECTION_MESSAGES.declined)).toBeTruthy());

    expect(clearUnlockSecret).not.toHaveBeenCalled();
    expect(localStorage.getItem(PIN_ATTEMPTS_KEY)).toBeNull();
    expect(ctx.panicWipe).not.toHaveBeenCalled();
  });
});
