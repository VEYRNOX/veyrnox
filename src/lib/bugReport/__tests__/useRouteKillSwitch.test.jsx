import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Slice 1d — route kill switch hook. Pins the contract that consumers
// (BugReportFlow) rely on: while active, ANY navigation into a route
// canRecordOnRoute() denies fires onAbort exactly once per navigation.
//
// Mutation targets:
//   - initial-mount abort fires spuriously → allowed-route mount asserts absence
//   - navigation into denied route missed → transition test goes red
//   - inactive hook fires anyway → active=false transition asserts absence

let currentPath = '/settings';
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: currentPath }),
}));

// The hook imports canRecordOnRoute for real — use the actual allowlist
// so the test also exercises the slice-1a contract in situ.

let useRouteKillSwitch;
beforeEach(async () => {
  currentPath = '/settings';
  vi.resetModules();
  useRouteKillSwitch = (await import('../useRouteKillSwitch')).useRouteKillSwitch;
});

describe('useRouteKillSwitch — inactive', () => {
  it('does NOT invoke onAbort when active=false, regardless of route', () => {
    const onAbort = vi.fn();
    currentPath = '/pin'; // denylisted
    renderHook(() => useRouteKillSwitch({ active: false, onAbort }));
    expect(onAbort).not.toHaveBeenCalled();
  });
});

describe('useRouteKillSwitch — active on allowlisted route', () => {
  it('does NOT fire onAbort on mount', () => {
    const onAbort = vi.fn();
    currentPath = '/settings';
    renderHook(() => useRouteKillSwitch({ active: true, onAbort }));
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('does NOT fire when navigating to another allowlisted route', () => {
    const onAbort = vi.fn();
    currentPath = '/settings';
    const { rerender } = renderHook(({ path }) => {
      currentPath = path;
      return useRouteKillSwitch({ active: true, onAbort });
    }, { initialProps: { path: '/settings' } });

    rerender({ path: '/dashboard' });
    rerender({ path: '/receive' });
    expect(onAbort).not.toHaveBeenCalled();
  });
});

describe('useRouteKillSwitch — navigation into denied route', () => {
  it('fires onAbort when navigating from allowlisted to denylisted', () => {
    const onAbort = vi.fn();
    currentPath = '/settings';
    const { rerender } = renderHook(({ path }) => {
      currentPath = path;
      return useRouteKillSwitch({ active: true, onAbort });
    }, { initialProps: { path: '/settings' } });

    // Simulate navigation into a denied route.
    rerender({ path: '/seed/reveal' });
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('fires onAbort for a route not on either list (unknown = DENIED, I4)', () => {
    const onAbort = vi.fn();
    currentPath = '/settings';
    const { rerender } = renderHook(({ path }) => {
      currentPath = path;
      return useRouteKillSwitch({ active: true, onAbort });
    }, { initialProps: { path: '/settings' } });

    // A brand-new route with no classification — DENIED by fail-closed default.
    rerender({ path: '/some-new-page' });
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});

describe('useRouteKillSwitch — armed on denied route', () => {
  it('fires immediately if the hook activates while already on a denied route', () => {
    const onAbort = vi.fn();
    currentPath = '/pin';
    // Simulate the "flow armed while on a denied route" edge case — should
    // not be reachable from the UI (the button is on /settings) but if it
    // ever is, the hook must fail-closed. Mutation defence: if the initial-
    // path check is skipped, this row goes green with onAbort not called.
    renderHook(() => useRouteKillSwitch({ active: true, onAbort }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});
