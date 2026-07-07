// WalletEntry — web/native PIN-cohort parity.
//
// History: web used to be a separate "password cohort" (12+ char alphanumeric
// password at creation) while unlock was migrated to a numeric-only PinPad by
// PR #637 — a half-finished migration that made real vaults permanently
// unlockable-never-again once a password containing a non-digit character was
// set (the create screen accepted it; the unlock PinPad physically cannot).
//
// Fix: web is a testing-only surface (never production; native is the real
// product) that should fully mirror native's PIN cohort — same 8-digit PinPad
// at creation AND unlock, same authModel='pin', same createWalletFromPendingPin
// provisioning path. This pins that contract.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));

// Real authModel store so getAuthModel() reflects whatever setAuthModel persisted.
let authModelValue = 'pin';
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
import { setAuthModel } from '@/lib/authModel';
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
    createWalletFromPendingPin: vi.fn(async () => undefined),
    importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

const WEB_PIN = '48273951'; // 8-digit, non-sequential PIN, same shape web now shares with native

function enterPinPad(container, digits) {
  // PinPad accepts numeric on-screen buttons; digits are individually clicked.
  for (const d of digits) {
    fireEvent.click(screen.getAllByRole('button', { name: d }).slice(-1)[0]);
  }
}

beforeEach(() => {
  authModelValue = 'pin';
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — web joins the PIN cohort (parity with native, lockout fix)', () => {
  it('persists authModel=pin (not password) when finishing web pin-create', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // Fresh device lands on the welcome hero → Get Started → pin-create.
    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    // Web pin-create now renders the SAME numeric PinPad as native (no password Input).
    await waitFor(() => expect(screen.getByText(/choose an 8-digit pin/i)).toBeTruthy());
    expect(screen.queryByPlaceholderText(/at least 12 characters/i)).toBeNull();

    enterPinPad(document, WEB_PIN.split(''));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));

    // Confirm step: same PIN again.
    await waitFor(() => expect(screen.getByText(/confirm your pin/i)).toBeTruthy());
    enterPinPad(document, WEB_PIN.split(''));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));

    // finishPinSetup ran. On web (now unified), the cohort marker MUST be 'pin' —
    // the separate 'password' cohort that caused the lockout no longer exists.
    await waitFor(() => expect(ctx.setupPin).toHaveBeenCalledWith(WEB_PIN));
    expect(setAuthModel).not.toHaveBeenCalledWith('password');
  });

  it('web Phase 2 create calls createWalletFromPendingPin (unified with native), not raw createWallet', async () => {
    // setupPin flips hasPendingPin on the SAME mocked context object (mirrors what
    // the real provider does), so the next re-render sees Phase 2 (no remount —
    // resolveOnboardingEntry's cold-mount invariant never produces 'choose', by
    // design, so a real re-mount would just bounce back to 'welcome').
    const ctx = makeCtx();
    ctx.setupPin = vi.fn(() => { ctx.hasPendingPin = true; });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    await waitFor(() => expect(screen.getByText(/choose an 8-digit pin/i)).toBeTruthy());
    enterPinPad(document, WEB_PIN.split(''));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));

    await waitFor(() => expect(screen.getByText(/confirm your pin/i)).toBeTruthy());
    enterPinPad(document, WEB_PIN.split(''));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));

    // Phase 2 (choose screen): Create Wallet button now visible.
    const createBtn = await screen.findByRole('button', { name: /create wallet/i });
    fireEvent.click(createBtn);

    await waitFor(() => expect(ctx.createWalletFromPendingPin).toHaveBeenCalled());
  });
});

describe('WalletEntry — password-cohort unlock fallback (post-handleImport regression fix)', () => {
  // Regression: when a user imports a vault via handleImport (e.g. "Restore from
  // seed phrase" after forgetting a PIN), authModel is set to "password". On the
  // next reload, view="unlock" and authModel="password" — without the password-
  // cohort unlock block the user sees a blank screen (no render branch matches).
  // This test pins that the password unlock view renders and wires to unlock().

  it('renders a password text input (not PinPad) when authModel=password and vault exists', async () => {
    authModelValue = 'password';
    const ctx = makeCtx({ hasVault: vi.fn(async () => true) });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // The password unlock view must render — NOT the PIN pad.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/vault password/i)).toBeTruthy()
    );
    // No PinPad numeric buttons (those belong to the PIN cohort).
    expect(screen.queryByRole('group', { name: /PIN entry/i })).toBeNull();
    // Unlock button is present but disabled while the field is empty.
    expect(screen.getByRole('button', { name: /unlock/i }).disabled).toBe(true);
  });

  it('calls unlock() when user enters a password and submits', async () => {
    authModelValue = 'password';
    const unlockFn = vi.fn(async () => ({ ok: true }));
    const ctx = makeCtx({ hasVault: vi.fn(async () => true), unlock: unlockFn });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    const input = await screen.findByPlaceholderText(/vault password/i);
    fireEvent.change(input, { target: { value: 'MyVaultPassword123' } });

    const unlockBtn = screen.getByRole('button', { name: /unlock/i });
    expect(unlockBtn.disabled).toBe(false);
    fireEvent.click(unlockBtn);

    await waitFor(() => expect(unlockFn).toHaveBeenCalled());
  });
});
