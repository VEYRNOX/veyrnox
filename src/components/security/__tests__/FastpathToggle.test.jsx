// FastpathToggle — Settings switch + one-time disclosure card (#2019 UI).
//
// Contract (owner-ruled Q3 REVERSED — default-ON with mandatory first-run
// disclosure card):
//   - Toggle shows EFFECTIVE state = isFastpathEnabled() && hasSeenFastpathDisclosure().
//     A fresh install (default-on, disclosure unseen) therefore renders
//     UNCHECKED, matching the first-run card's "not yet chosen" reality.
//   - Enable path (toggle currently OFF) FIRST run → disclosure card shown;
//     user must acknowledge, at which point markFastpathDisclosureSeen() +
//     setFastpathEnabled(true) both fire.
//   - Enable path REPEAT run (disclosure marker already set, e.g. because
//     user tapped "Not now" on the first-run card) → straight
//     setFastpathEnabled(true), no re-disclosure.
//   - Disable → setFastpathEnabled(false) writes explicit '0' (tri-state:
//     distinguishes explicit OFF from not-yet-chosen so the init migration
//     does not silently re-enable) + best-effort clearFastpathDek().
//   - I3: decoy/demo → renders NULL entirely.
//   - Non-Android → renders NULL (feature is Android-only).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));

// Best-effort cache clear on disable — spied so we can assert it was invoked.
const clearFastpathDekSpy = vi.fn(async () => {});
vi.mock('@/plugins/androidBiometricCache', () => ({
  clearFastpathDek: (...a) => clearFastpathDekSpy(...a),
  getFastpathDek: vi.fn(async () => null),
  putFastpathDek: vi.fn(async () => {}),
}));

import {
  FASTPATH_ENABLED_STORAGE_KEY,
  FASTPATH_DISCLOSURE_SEEN_KEY,
  isFastpathEnabled,
  hasSeenFastpathDisclosure,
  hasFastpathBeenExplicitlySet,
} from '@/lib/fastpathUnlock';
import { isBiometricUnlockEnabled, BIOMETRIC_PREF_KEY } from '@/lib/biometric';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import FastpathToggle from '@/components/security/FastpathToggle';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  clearFastpathDekSpy.mockClear();
});
afterEach(() => { cleanup(); setDeniabilitySession(false); });

describe('FastpathToggle', () => {
  it('fresh install: toggle rendered UNCHECKED, no disclosure visible, no explicit choice recorded', () => {
    // Default-ON reversal: isFastpathEnabled() returns true here (no explicit
    // choice + no disclosure = default-on). The toggle reflects EFFECTIVE
    // state (also gated on disclosure-seen), so the visible switch honestly
    // shows "not yet on" rather than lying about a benefit not yet active.
    render(<FastpathToggle />);
    const toggle = screen.getByTestId('fastpath-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
    expect(hasFastpathBeenExplicitlySet()).toBe(false);
    expect(hasSeenFastpathDisclosure()).toBe(false);
  });

  it('enable path FIRST run: disclosure shown, ack → marker + enable both set', async () => {
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    // Disclosure must not have been marked seen yet — the WRITE gate has not
    // fired (see FastpathToggle.jsx handleAck). The enabled-storage key may
    // still read as default-on under the tri-state semantics; the honest
    // pre-ack assertion is that the DISCLOSURE MARKER is not yet set.
    expect(hasSeenFastpathDisclosure()).toBe(false);
    const ack = screen.getByTestId('fastpath-disclosure-ack');
    expect(ack).toBeTruthy();
    // M-3 (audit-2026-08-25): the disclosure must say fast unlock bypasses the
    // Emergency and panic PINs, not "everything else is unchanged" — that
    // sentence read as a false all-clear to a duress-PIN user.
    expect(screen.getByTestId('fastpath-disclosure').textContent).toMatch(
      /Emergency PIN and panic PIN only apply when you unlock by typing a PIN/,
    );
    await act(async () => { fireEvent.click(ack); });
    expect(isFastpathEnabled()).toBe(true);
    expect(hasSeenFastpathDisclosure()).toBe(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
  });

  it('enable path REPEAT run: prior explicit "0" + disclosure seen → straight enable, no re-disclosure', async () => {
    // Scenario: user tapped "Not now" on the first-run card → key='0',
    // disclosure='1'. Toggle renders unchecked (effective state matches).
    // Tapping should straight-enable without another disclosure.
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    render(<FastpathToggle />);
    expect(screen.getByTestId('fastpath-toggle').getAttribute('aria-checked')).toBe('false');
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
    expect(isFastpathEnabled()).toBe(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
  });

  it('enable path FIRST run: ack ALSO enables Biometric Unlock (#2037 linked)', async () => {
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-disclosure-ack')); });
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBe('1');
  });

  it('enable path REPEAT run: straight enable ALSO enables Biometric Unlock (#2037 linked)', async () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBe('1');
  });

  it('disable: does NOT touch Biometric Unlock pref (asymmetric — independent user features)', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(isFastpathEnabled()).toBe(false);
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBe('1');
  });

  it('disable: writes explicit "0" (tri-state) + best-effort cache clear', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(isFastpathEnabled()).toBe(false);
    // Tri-state semantics: disable writes '0' rather than remove(), so the
    // init migration does not later mistake this for "never chosen".
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('0');
    expect(clearFastpathDekSpy).toHaveBeenCalledTimes(1);
  });

  it('decoy/demo: renders null (I3)', () => {
    setDeniabilitySession(true);
    const { container } = render(<FastpathToggle />);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('fastpath-toggle')).toBeNull();
  });

  it('passkey registered: renders null (owner ruling — passkey users hidden from fast-path)', async () => {
    // Simulate an enrolled passkey by writing the public-handle record shape
    // getRegisteredPasskey() expects (id:string is the presence test).
    localStorage.setItem(
      'veyrnox-passkey-cred',
      JSON.stringify({ id: 'test-cred-id', rpId: 'veyrnox.com', label: 't', simulated: true, createdAt: Date.now() }),
    );
    const { container } = render(<FastpathToggle />);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('fastpath-toggle')).toBeNull();
  });
});

describe('FastpathToggle — non-Android hidden', () => {
  it('renders null on non-Android platform', async () => {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
    }));
    const Mod = await import('@/components/security/FastpathToggle');
    const { container } = render(<Mod.default />);
    expect(container.textContent).toBe('');
  });
});
