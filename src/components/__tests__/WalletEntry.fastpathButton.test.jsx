// WalletEntry — fast-path biometric unlock BUTTON above the PIN keypad (#2019 UI).
//
// The button is a PARALLEL entry to the existing PIN pad, gated by ANDs:
//   - Capacitor.getPlatform() === 'android'
//   - isFastpathEnabled() (tri-state; default-ON since the Q3 reversal, only
//     an explicit '0' disables)
//   - hasSeenFastpathDisclosure() — informed-consent chokepoint for the
//     default-ON flip. Without it a fresh install would silently show a
//     stronger-unlock button before the user understood what it does.
//   - checkBiometry().isAvailable
//   - not deniability/demo (I3 chokepoint)
//   - passkey NOT registered
//
// Missing ANY gate → the button MUST NOT render (fail-closed visibility).
// On tap, it calls unlockBiometricOnly(); on { fallbackToPin:true } the PIN pad
// stays visible so the user can type their PIN (I4 fail-closed).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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
  getBiometricStatus: vi.fn(async () => ({ available: true, label: 'Fingerprint', mode: 'native' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
const isPasskeyRegisteredMock = vi.fn(() => false);
vi.mock('@/lib/passkey', () => ({
  isPasskeyGateError: vi.fn(() => false),
  isPasskeyRegistered: (...a) => isPasskeyRegisteredMock(...a),
  PASSKEY_GATE_MESSAGES: {},
  PASSKEY_ESCAPE_HATCH_BLURBS: {},
}));
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => true) }));

// ANDROID native platform.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));

// The real fastpathUnlock module respects deniability at the WRITE — reads are
// ungated and return true/false based on the flag key.
import { FASTPATH_ENABLED_STORAGE_KEY, FASTPATH_DISCLOSURE_SEEN_KEY } from '@/lib/fastpathUnlock';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import { useWallet } from '@/lib/WalletProvider';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(async () => ({ ok: true })),
    unlockBiometricOnly: vi.fn(async () => ({ ok: true })),
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

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

const FASTPATH_BUTTON_TESTID = 'fastpath-unlock-button';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  // Native + vault + missing auth-model marker routes to 'vault-desync' (see
  // WalletEntry hasVault effect). Set the marker so we reach the 'unlock' view.
  try { localStorage.setItem('veyrnox-auth-model', 'pin'); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  isPasskeyRegisteredMock.mockReturnValue(false);
});
afterEach(() => { cleanup(); setDeniabilitySession(false); });

// Enable the fast-path AND record disclosure-seen so the button clears both
// gates in the "all-conditions-pass" cases. Individual tests then unset one at
// a time to exercise the visibility matrix.
function armFastpath() {
  localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
  localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
}

describe('WalletEntry — fast-path biometric button visibility matrix', () => {
  it('all gates pass → button STILL HIDDEN (owner ruling 2026-08-25 — duplicate-button UX bug)', async () => {
    // Fast-path button is currently HARDCODED HIDDEN in WalletEntry.jsx
    // (const fastpathButtonVisible = false). Even with every gate green,
    // the button does not render — this prevents the "two Unlock with
    // fingerprint" duplicate on the unlock screen where the fast-path
    // button errored on cache-miss while the OLD Biometric Unlock button
    // beneath it always worked. If this test starts failing (button
    // rendering), whoever un-hid must first fix the duplicate-button issue
    // (either merge the two buttons or gate the fast-path button on cache
    // presence).
    armFastpath();
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  // ── THE GATE MATRIX BELOW IS SKIPPED, NOT DELETED ─────────────────────────
  //
  // UN-SKIP CONDITION: the moment `fastpathButtonVisible` in WalletEntry.jsx
  // stops being a literal `false` and becomes a real expression again, remove
  // the `.skip` from all four tests below and confirm each one still fails for
  // ITS OWN reason (flip the single gate it names and watch exactly that test
  // go red — not all four at once).
  //
  // WHY THEY CANNOT STAY ACTIVE. #2106 replaced the six-condition gate with
  // `const fastpathButtonVisible = false`, so every one of these passes for the
  // same reason the "all gates pass" test above does: nothing renders, ever.
  // Their localStorage / decoy / passkey setup is inert — the conditions they
  // name (explicit opt-out, disclosure unseen, I3 decoy session, passkey
  // registered) are no longer read by any code path. Left active they read as
  // live coverage of an I3 chokepoint while asserting nothing about it, which is
  // the failure mode CLAUDE.md's 2026-07-28 entry (PR #1418) documents: a test
  // asserting a behaviour that can no longer occur is coverage that READS as
  // present and is not.
  //
  // Skipped rather than deleted because the gate expression itself was removed
  // from WalletEntry.jsx, not merely short-circuited — `isDeniabilityOrDemoActive()`
  // and `hasSeenFastpathDisclosure()` no longer appear in it at all. Whoever
  // restores the button has to re-author the I3 chokepoint from scratch, and
  // these are the specs that say what it has to do. Deleting them would take
  // that with it.
  //
  // The tripwire that sends you back here is the "all gates pass" test above:
  // it is bidirectional and goes red the moment the button renders.
  // ──────────────────────────────────────────────────────────────────────────

  it.skip('fastpath explicitly OFF ("0") → button hidden', async () => {
    // Explicit opt-out under the tri-state semantics. Disclosure is set so
    // the ONLY reason for hiding here is the explicit "0".
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it.skip('disclosure not seen → button hidden (informed-consent chokepoint for default-ON)', async () => {
    // Under the default-ON reversal, isFastpathEnabled() returns true here
    // (absent key = default-on). The disclosure marker is the ONLY thing
    // preventing the button from appearing on a fresh install before the
    // user has understood what it does.
    // (No localStorage writes at all → default-on + disclosure not seen.)
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it.skip('decoy session → button hidden (I3 chokepoint)', async () => {
    armFastpath();
    setDeniabilitySession(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx({ isDecoy: true }));
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it.skip('passkey registered → button hidden (owner ruling — passkey stays the sole biometric-adjacent factor)', async () => {
    armFastpath();
    isPasskeyRegisteredMock.mockReturnValue(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  // Skipped while fastpathButtonVisible is hardcoded false (owner ruling
  // 2026-08-25 — see comment on the "all gates pass" test above). Un-skip
  // once the button is re-enabled + duplicate-button bug is fixed.
  it.skip('tap → invokes unlockBiometricOnly() (parallel to PIN, no password argument)', async () => {
    armFastpath();
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await act(async () => {
      fireEvent.click(screen.getByTestId(FASTPATH_BUTTON_TESTID));
    });
    await waitFor(() => expect(ctx.unlockBiometricOnly).toHaveBeenCalledTimes(1));
    // First arg must NOT be a string (no password ever passes through this branch).
    const arg0 = ctx.unlockBiometricOnly.mock.calls[0][0];
    expect(typeof arg0).not.toBe('string');
  });

  // Skipped for the same reason as the "tap" test above — button is hidden.
  it.skip('fallbackToPin → PIN keypad stays visible (I4 fail-closed)', async () => {
    armFastpath();
    const ctx = makeCtx({
      unlockBiometricOnly: vi.fn(async () => ({ ok: false, fallbackToPin: true, code: 'FASTPATH_MISS' })),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await act(async () => {
      fireEvent.click(screen.getByTestId(FASTPATH_BUTTON_TESTID));
    });
    await waitFor(() => expect(ctx.unlockBiometricOnly).toHaveBeenCalled());
    // The PIN pad remains available so the user can complete unlock the normal way.
    expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy();
  });
});
