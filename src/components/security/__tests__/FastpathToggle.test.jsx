// FastpathToggle — opt-in Settings switch + one-time disclosure card (#2019 UI).
//
// Contract (owner-ruled Q3):
//   - Default OFF. The switch reflects isFastpathEnabled() (defaults false).
//   - Enable path FIRST run → disclosure card shown; user must acknowledge, at
//     which point markFastpathDisclosureSeen() + setFastpathEnabled(true) both fire.
//   - Enable path REPEAT run (marker already set) → straight setFastpathEnabled(true),
//     no re-disclosure.
//   - Disable → setFastpathEnabled(false) + best-effort clearFastpathDek().
//   - I3: decoy/demo → renders NULL entirely (no read is a tell either — the
//     toggle would show a state that a coerced tap could try to flip).
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
} from '@/lib/fastpathUnlock';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import FastpathToggle from '@/components/security/FastpathToggle';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  clearFastpathDekSpy.mockClear();
});
afterEach(() => { cleanup(); setDeniabilitySession(false); });

describe('FastpathToggle', () => {
  it('default OFF: toggle rendered unchecked, no disclosure visible', () => {
    render(<FastpathToggle />);
    const toggle = screen.getByTestId('fastpath-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
    expect(isFastpathEnabled()).toBe(false);
  });

  it('enable path FIRST run: disclosure shown, ack → marker + enable both set', async () => {
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    // Not enabled YET — disclosure must gate the write.
    expect(isFastpathEnabled()).toBe(false);
    const ack = screen.getByTestId('fastpath-disclosure-ack');
    expect(ack).toBeTruthy();
    await act(async () => { fireEvent.click(ack); });
    expect(isFastpathEnabled()).toBe(true);
    expect(hasSeenFastpathDisclosure()).toBe(true);
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
  });

  it('enable path REPEAT run: no re-disclosure, straight enable', async () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(screen.queryByTestId('fastpath-disclosure')).toBeNull();
    expect(isFastpathEnabled()).toBe(true);
  });

  it('disable: clears the setting + best-effort cache clear', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    render(<FastpathToggle />);
    await act(async () => { fireEvent.click(screen.getByTestId('fastpath-toggle')); });
    expect(isFastpathEnabled()).toBe(false);
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
