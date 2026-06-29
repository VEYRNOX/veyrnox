// WalletEntry — web cohort lockout regression.
//
// Bug: finishPinSetup() always persisted authModel='pin' regardless of platform.
// On web, the pin-create screen is a password cohort (no hardware KEK; the password
// is the only protection). Persisting 'pin' means the next reload renders the
// numeric-only PinPad, which CANNOT accept a 12+ char alphanumeric password — the
// user is permanently locked out of their funds.
//
// This pins the contract: on WEB (Capacitor.isNativePlatform() === false), completing
// the pin-create flow must persist authModel='password' (NOT 'pin'). We assert the
// machine cohort marker — setAuthModel('password') and getAuthModel() === 'password' —
// never prose copy. The native PIN cohort path is covered by the existing wipe test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));

// Real authModel store so getAuthModel() reflects whatever setAuthModel persisted.
let authModelValue = 'password';
vi.mock('@/lib/authModel', () => ({
  getAuthModel: vi.fn(() => authModelValue),
  setAuthModel: vi.fn((m) => { authModelValue = m; }),
}));

// Web platform: isNativePlatform() === false is the cohort switch under test.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: 'Face ID' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({ hasStoredUnlockSecret: vi.fn(async () => false) }));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

import { useWallet } from '@/lib/WalletProvider';
import { getAuthModel, setAuthModel } from '@/lib/authModel';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false,
    hasVault: vi.fn(async () => false), // fresh device → welcome → pin-create
    unlock: vi.fn(),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(async () => 'word '.repeat(12).trim()),
    importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

const WEB_PASSWORD = 'correct horse battery staple'; // 12+ char alphanumeric web vault password

beforeEach(() => {
  authModelValue = 'password';
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — web cohort must persist authModel=password (lockout fix)', () => {
  it('persists authModel=password (not pin) when finishing web pin-create', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // Fresh device lands on the welcome hero → Get Started → pin-create.
    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    // Web pin-create renders the #472 password input (not a numeric PinPad).
    const pwInput = await screen.findByPlaceholderText(/at least 12 characters/i);
    fireEvent.change(pwInput, { target: { value: WEB_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Confirm step: re-enter the same password and submit.
    const confirmInput = await screen.findByPlaceholderText(/re-enter your password/i);
    fireEvent.change(confirmInput, { target: { value: WEB_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: /set password & continue/i }));

    // finishPinSetup ran. On web, the cohort marker MUST be 'password', never 'pin' —
    // otherwise reload renders the numeric PinPad and locks the user out (the bug).
    await waitFor(() => expect(setAuthModel).toHaveBeenCalledWith('password'));
    expect(setAuthModel).not.toHaveBeenCalledWith('pin');
    expect(getAuthModel()).toBe('password');
  });
});
