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

// Every path below is declared in src/App.jsx. This file originally used
// `/dashboard`, `/pin` and `/seed/reveal`, none of which are routes — it was
// written against slice 1a's lists, which did not match the router (see
// routesMatchRouter.test.js).
//
// Only `/dashboard` actually broke when the lists were corrected. `/pin` and
// `/seed/reveal` kept passing, because an unknown path is denied by the
// fail-closed default — which is the point worth keeping: a denied-route case
// here cannot tell "on the denylist" from "unknown", so it must not be read as
// evidence that a given route is listed. That evidence lives in
// routesMatchRouter.test.js.
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
    currentPath = '/duress-pin'; // real denylisted route
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

    rerender({ path: '/' });
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

    // A real route that is on the denylist.
    //
    // Be clear about what this can and cannot prove: with an unknown path
    // denied by default, this case passes whether or not `/wallet-seed-qr` is
    // actually listed — verified by deleting it from the DENYLIST, after which
    // this file stayed green and only routesMatchRouter.test.js went red. So
    // THIS test pins the hook's behaviour on a denied route; the lists' own
    // contents are pinned there, and deny-vs-default is distinguished in
    // recordableRoutes.test.js via _internals.evaluate. Using a real path here
    // is still worth it — it stops the file describing a router that does not
    // exist, which is how `/seed/reveal` sat here reading as coverage.
    rerender({ path: '/wallet-seed-qr' });
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
    currentPath = '/wallet-seed-qr';
    // Simulate the "flow armed while on a denied route" edge case — should
    // not be reachable from the UI (the button is on /settings) but if it
    // ever is, the hook must fail-closed. Mutation defence: if the initial-
    // path check is skipped, this row goes green with onAbort not called.
    renderHook(() => useRouteKillSwitch({ active: true, onAbort }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});
