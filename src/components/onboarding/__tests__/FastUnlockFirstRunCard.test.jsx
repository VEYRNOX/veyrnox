// FastUnlockFirstRunCard — informed-consent chokepoint for default-ON (#2019).
//
// Renders IFF: Android + biometric available + KEK-wrapped vault + not
// deniability/demo + no passkey + no explicit choice recorded + disclosure
// marker not yet set. Both buttons mark the disclosure seen; "Enable" writes
// '1', "Not now" writes '0' (tri-state, so a future migration honours OFF).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));

const isHardwareKekEnrolledMock = vi.fn(async () => true);
vi.mock('@/lib/hardwareKekStatus', () => ({
  isHardwareKekEnrolled: (...a) => isHardwareKekEnrolledMock(...a),
}));

const bioStatusMock = vi.fn(async () => ({ available: true, label: 'Fingerprint' }));
vi.mock('@/lib/biometric', () => ({
  getBiometricStatus: (...a) => bioStatusMock(...a),
}));

const isPasskeyRegisteredMock = vi.fn(() => false);
vi.mock('@/lib/passkey', () => ({
  isPasskeyRegistered: () => isPasskeyRegisteredMock(),
}));

import {
  FASTPATH_ENABLED_STORAGE_KEY,
  FASTPATH_DISCLOSURE_SEEN_KEY,
  isFastpathEnabled,
  hasSeenFastpathDisclosure,
} from '@/lib/fastpathUnlock';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import FastUnlockFirstRunCard from '@/components/onboarding/FastUnlockFirstRunCard';

const CARD = 'fastpath-first-run-card';
const ENABLE = 'fastpath-first-run-enable';
const DECLINE = 'fastpath-first-run-decline';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  isHardwareKekEnrolledMock.mockResolvedValue(true);
  bioStatusMock.mockResolvedValue({ available: true, label: 'Fingerprint' });
  isPasskeyRegisteredMock.mockReturnValue(false);
});
afterEach(() => { cleanup(); setDeniabilitySession(false); });

describe('FastUnlockFirstRunCard — gate matrix', () => {
  it('shows on a fresh install (all gates pass, no explicit choice, disclosure unseen)', async () => {
    render(<FastUnlockFirstRunCard />);
    await waitFor(() => expect(screen.getByTestId(CARD)).toBeTruthy());
  });

  it('hidden when disclosure has already been seen (one-time)', async () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    render(<FastUnlockFirstRunCard />);
    // Give any pending effect a tick, then assert absence.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('hidden when the user has already made an explicit choice ("0" or "1")', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    render(<FastUnlockFirstRunCard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('hidden in decoy/demo (I3 — no read is a tell either)', async () => {
    setDeniabilitySession(true);
    render(<FastUnlockFirstRunCard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('hidden when a passkey is registered (owner ruling — passkey users hidden from fast-path)', async () => {
    isPasskeyRegisteredMock.mockReturnValue(true);
    render(<FastUnlockFirstRunCard />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('hidden when the vault is not KEK-wrapped (fast-path prerequisite)', async () => {
    isHardwareKekEnrolledMock.mockResolvedValue(false);
    render(<FastUnlockFirstRunCard />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('hidden when biometric is not available', async () => {
    bioStatusMock.mockResolvedValue({ available: false });
    render(<FastUnlockFirstRunCard />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId(CARD)).toBeNull();
  });
});

describe('FastUnlockFirstRunCard — chokepoint writes', () => {
  it('Enable → marks disclosure seen + writes "1"', async () => {
    render(<FastUnlockFirstRunCard />);
    await waitFor(() => expect(screen.getByTestId(ENABLE)).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByTestId(ENABLE)); });
    expect(hasSeenFastpathDisclosure()).toBe(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    expect(isFastpathEnabled()).toBe(true);
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it('Not now → marks disclosure seen + writes explicit "0" (tri-state OFF)', async () => {
    render(<FastUnlockFirstRunCard />);
    await waitFor(() => expect(screen.getByTestId(DECLINE)).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByTestId(DECLINE)); });
    expect(hasSeenFastpathDisclosure()).toBe(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('0');
    expect(isFastpathEnabled()).toBe(false);
    expect(screen.queryByTestId(CARD)).toBeNull();
  });
});
