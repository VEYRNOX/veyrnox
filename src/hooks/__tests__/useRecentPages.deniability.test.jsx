// src/hooks/__tests__/useRecentPages.deniability.test.jsx
//
// C-1 (CRITICAL deniability finding). useRecentPages persists visited paths to
// sessionStorage['veyrnox-recent-pages'] and Layout renders them as labelled
// tiles ("Duress PIN", "Stealth Wallets", "Panic Wipe") in the mobile More
// drawer. Before this fix there was NO deniability gate on the write OR the
// read, no clear() caller, and no panic-wipe sweep — so a coercer unlocking
// with the duress PIN saw the REAL session's security-page history. I3 tell.
//
// These tests pin the machine behaviour, not copy:
//   1. WRITE suppressed while isDeniabilityOrDemoActive() is true.
//   2. READ/RENDER suppressed — recents resolves to [] live, even if the key
//      already holds real-session entries (fail-closed on a mid-session flip).
//   3. clear() fires on APP_LOCK_EVENT (the hook subscribes).
//   4. Fail closed: if the deniability check throws, treat as active.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Location is driven explicitly per-test via this mutable ref.
const loc = { pathname: '/duress-pin' };
vi.mock('react-router-dom', () => ({ useLocation: () => loc }));

// The deniability helper is mocked so we can flip it (and make it throw) without
// standing up a WalletProvider session.
const deniability = { active: false, throws: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => {
    if (deniability.throws) throw new Error('storage unavailable');
    return deniability.active;
  },
  isDeniabilitySessionActive: () => false,
}));

import useRecentPages from '@/hooks/useRecentPages';
import { APP_LOCK_EVENT } from '@/lib/copySecret';

const KEY = 'veyrnox-recent-pages';

beforeEach(() => {
  window.sessionStorage.clear();
  deniability.active = false;
  deniability.throws = false;
  loc.pathname = '/duress-pin';
});
afterEach(() => { window.sessionStorage.clear(); });

describe('useRecentPages — I3 deniability gate (C-1)', () => {
  it('records a visited path in a normal (non-deniability) session', () => {
    const { result } = renderHook(() => useRecentPages());
    expect(result.current.recents).toEqual(['/duress-pin']);
    expect(JSON.parse(window.sessionStorage.getItem(KEY))).toEqual(['/duress-pin']);
  });

  it('does NOT write to sessionStorage in a deniability/demo session', () => {
    deniability.active = true;
    const { result } = renderHook(() => useRecentPages());
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(result.current.recents).toEqual([]);
  });

  it('does NOT surface pre-existing real-session recents to a deniability session', () => {
    // Real session wrote security pages; then a decoy session opens.
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify(['/duress-pin', '/stealth-wallets', '/panic-wipe']),
    );
    deniability.active = true;
    const { result } = renderHook(() => useRecentPages());
    expect(result.current.recents).toEqual([]);
  });

  it('suppresses already-loaded recents when the session flips mid-render (live check)', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(['/stealth-wallets']));
    const { result, rerender } = renderHook(() => useRecentPages());
    expect(result.current.recents.length).toBeGreaterThan(0);

    // Decoy session opens while the shell stays mounted.
    deniability.active = true;
    rerender();
    expect(result.current.recents).toEqual([]);
  });

  it('fails CLOSED — a throwing deniability check suppresses read and write', () => {
    deniability.throws = true;
    const { result } = renderHook(() => useRecentPages());
    expect(result.current.recents).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('useRecentPages — clear() on APP_LOCK_EVENT', () => {
  it('drops recents and removes the sessionStorage key when the wallet locks', () => {
    const { result } = renderHook(() => useRecentPages());
    expect(result.current.recents).toEqual(['/duress-pin']);
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();

    act(() => { window.dispatchEvent(new Event(APP_LOCK_EVENT)); });

    expect(result.current.recents).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('removes the APP_LOCK_EVENT listener on unmount', () => {
    const { unmount } = renderHook(() => useRecentPages());
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(removeSpy.mock.calls.some(([e]) => e === APP_LOCK_EVENT)).toBe(true);
    removeSpy.mockRestore();
  });
});
