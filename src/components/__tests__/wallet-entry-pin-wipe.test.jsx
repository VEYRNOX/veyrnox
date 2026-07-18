// WalletEntry PIN-unlock → panic-wipe wiring (target item 5a).
//
// Part 1 made a WRONG PIN throw "Incorrect PIN" (the Option-A decoy fallback was
// removed). This pins Part 2: after PIN_WIPE_AFTER (10) CONSECUTIVE wrong-PIN
// misses, runPinUnlock fires the REAL provider panicWipe({ confirmed: true }) —
// irreversible local wipe, NO confirmation dialog (a dialog is a liability under
// the threat model). A SUCCESSFUL unlock (it does NOT throw) resets the counter.
// A genuine infra/biometric-gate error does NOT count toward the wipe.
//
// We mock useWallet so `unlock` is a controllable spy and `panicWipe` is a spy we
// assert on (we NEVER run the real wipe in a test). We drive the real PinPad UI:
// type 8 digits, click "Submit PIN". We assert STRUCTURE — panicWipe call count and
// its { confirmed: true } guard, plus the interpolated remaining-count in the
// warning (load-bearing) — not prose copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(), notification: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() }));
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: 'Face ID' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({ hasStoredUnlockSecret: vi.fn(async () => false) }));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

import { useWallet } from '@/lib/WalletProvider';
import { isPasskeyGateError } from '@/lib/passkey';
import { isBiometricGateError } from '@/lib/biometric';
import { PIN_WIPE_AFTER } from '@/lib/pinAttemptGuard';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false,
    hasVault: vi.fn(async () => true),  // returning-user → 'unlock' view
    unlock: vi.fn(),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

// Drive the PinPad: type 8 digits, then click "Submit PIN".
async function enterPin(pin = '13572468') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));
}

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

beforeEach(() => {
  vi.mocked(isPasskeyGateError).mockReturnValue(false);
  vi.mocked(isBiometricGateError).mockReturnValue(false);
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — 10 wrong PINs trigger the real panic wipe', () => {
  it('fires panicWipe({ confirmed: true }) EXACTLY once on the 10th consecutive wrong PIN, not before', async () => {
    const unlock = vi.fn(async () => { throw new Error('GCM decrypt failed'); }); // every PIN wrong
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    for (let i = 1; i <= PIN_WIPE_AFTER; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
      if (i < PIN_WIPE_AFTER) {
        expect(panicWipe).not.toHaveBeenCalled(); // never before the threshold
      }
    }

    await waitFor(() => expect(panicWipe).toHaveBeenCalledTimes(1));
    expect(panicWipe).toHaveBeenCalledWith({ confirmed: true });
  });

  it('a successful unlock before 10 resets the counter — no wipe', async () => {
    // 5 wrong, then 1 success, then 5 more wrong → still under 10 consecutively, no wipe.
    let calls = 0;
    const unlock = vi.fn(async () => {
      calls += 1;
      if (calls === 6) return { ok: true }; // the 6th attempt succeeds (does NOT throw)
      throw new Error('GCM decrypt failed');
    });
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    for (let i = 1; i <= 11; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }
    // 11 attempts total but the 6th succeeded and reset the streak → max streak 5 < 10.
    expect(panicWipe).not.toHaveBeenCalled();
  });

  it('an infra/biometric-gate error does NOT count toward the wipe', async () => {
    // Every attempt is an INFRA failure, not a wrong PIN. Even past the threshold
    // count of throws, panicWipe must never fire.
    const unlock = vi.fn(async () => { const e = new Error('biometric gate failed'); throw e; });
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(isBiometricGateError).mockReturnValue(true); // classify as infra
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    for (let i = 1; i <= PIN_WIPE_AFTER + 2; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }
    expect(panicWipe).not.toHaveBeenCalled();
  });

  it('shows the iOS-style remaining-count warning near the threshold', async () => {
    const unlock = vi.fn(async () => { throw new Error('GCM decrypt failed'); });
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    // 6 misses → 4 attempts remaining; the warning must say so.
    for (let i = 1; i <= 6; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }
    await waitFor(() => expect(screen.getByText(/4 attempts before this device is wiped/i)).toBeTruthy());
  });
});

describe('WalletEntry — in-session loud wipe transition after 10-attempt auto-wipe', () => {
  // After the 10th consecutive wrong PIN fires panicWipe(), the LOUD "This device was
  // wiped" screen must appear IN THE SAME SESSION — not only on the next app open.
  // The gate is wasWiped && vaultExists === false; vaultExists is local state and is
  // set to false explicitly after the wipe succeeds (in addition to the provider
  // already setting wasWiped true).
  it('renders WipedNotice in-session immediately after the 10th wrong PIN wipes the device', async () => {
    const unlock = vi.fn(async () => { throw new Error('GCM decrypt failed'); });
    // panicWipe succeeds → sets wasWiped true in-session (simulated by returning the
    // provider with wasWiped:true after the wipe, via a controlled mock re-render).
    const acknowledgeWipe = vi.fn();
    const ctx = makeCtx({ unlock, wasWiped: true, acknowledgeWipe });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    for (let i = 1; i <= PIN_WIPE_AFTER; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }

    // After the 10th miss the wipe fired. wasWiped is already true (provider mock)
    // AND WalletEntry must have set vaultExists false locally — so the loud screen
    // renders without a page reload.
    await waitFor(() => expect(screen.getByText(/this device was wiped/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /start a new wallet/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore from recovery phrase/i })).toBeTruthy();
  });
});
