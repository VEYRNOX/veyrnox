// src/lib/bugReport/useRouteKillSwitch.js
//
// Slice 1d of the opt-in bug-report recording feature.
//
// Watches the current route while a recording is armed and fires onAbort the
// moment the user navigates into a route that canRecordOnRoute() denies.
// Enforced at THIS layer because the router changes location outside our
// state machine — the modal cannot stop the user from navigating, only
// respond to it.
//
// Belt-and-braces alongside slice 1a's fail-closed allowlist and the
// visibility kill switch from slice 1c. See docs/bug-report-recording-plan.md
// for the full kill-switch catalogue.
//
// The hook is deliberately narrow: given active=true, it invokes onAbort
// exactly once per denylist entry. It does NOT invoke onAbort for the
// route the hook was mounted on — that route is by definition already
// allowlisted at the start of a recording (the button was visible in
// Settings, which is allowlisted). Any SUBSEQUENT navigation into a denied
// route triggers abort.

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { canRecordOnRoute } from './recordableRoutes';

/**
 * @param {{ active: boolean, onAbort: () => void }} options
 */
export function useRouteKillSwitch({ active, onAbort }) {
  const location = useLocation();
  // Track the route the recording started on so the initial mount doesn't
  // count as a "navigation". If the initial route is somehow denied — e.g.
  // deep-linked into a denied route while the modal is opening — that IS
  // a legitimate abort (the check runs on the current path either way).
  const initialPathRef = useRef(location.pathname);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      // Reset when recording is not armed so a future start doesn't inherit
      // a stale initial-path reference.
      startedRef.current = false;
      initialPathRef.current = location.pathname;
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      initialPathRef.current = location.pathname;
      // Still check the current path — if the recording somehow armed on
      // a denied route (unexpected but possible), abort immediately.
      if (!canRecordOnRoute(location.pathname)) onAbort();
      return;
    }
    if (!canRecordOnRoute(location.pathname)) onAbort();
  }, [active, location.pathname, onAbort]);
}
