// src/notify/useNotifications.js
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief §3 (React glue: in-memory queue, session-scoped).
//
// Thin React glue: wires the pure queue reducer (queue.js) to useReducer and
// subscribes to the in-memory emitter (events.js). All real logic lives in the
// pure modules so it is unit-testable without a render harness; this file only
// connects them and shares the one queue across the authenticated shell.
//
// WHY A PROVIDER (not a bare hook): the queue must be SHARED — the header bell
// badge + toast (Layout) and the Notification Centre page (/notifications) have
// to read the SAME session queue, or the Centre shows nothing while the bell
// counts items (each bare-hook instance had its own useReducer state). The
// provider holds the one reducer + the one emitter subscription; every consumer
// reads it via context.
//
// Session lifecycle (I3 deniability — UNCHANGED): the provider is mounted INSIDE
// WalletGate (see App.jsx), so a lock/reload unmounts it and the queue + badge
// do not survive — the same wipe-on-unmount the bare hook relied on, just lifted
// one level. State is NEVER hydrated from a store; nothing is persisted.
// `clear()` stays exposed for an explicit lock.
//
// I4 (fail closed): a malformed event whose buildNotification throws is dropped
// silently; it never reaches the queue and never disturbs the emitting flow. A
// consumer rendered outside the provider gets an inert shape (never crashes).

import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { subscribe } from './events.js';
import { buildNotification } from './notify.js';
import { queueReducer, initialQueue } from './queue.js';

const NotificationsContext = createContext(null);

// Inert shape for a consumer mounted outside the provider — fail-safe (I4), so a
// stray useNotifications() can never throw or block a render.
const INERT = Object.freeze({
  notifications: [],
  unseenCount: 0,
  latest: null,
  markAllSeen: () => {},
  dismiss: () => {},
  clear: () => {},
});

/**
 * Holds the ONE session-scoped queue for the authenticated shell and provides it
 * to every consumer. Used as a react-router layout-route element (renders the
 * matched child via <Outlet/>), mounted under WalletGate so it unmounts — and the
 * queue is wiped — on lock/reload.
 */
export function NotificationsProvider() {
  const [state, dispatch] = useReducer(queueReducer, initialQueue);

  useEffect(() => {
    const unsub = subscribe((event) => {
      let notification;
      try {
        notification = buildNotification(event);
      } catch {
        return; // I4: drop a malformed event; never degrade or block.
      }
      (/** @type {any} */ (dispatch))({ type: 'push', notification });
    });
    return unsub; // discard on unmount (lock/reload) — nothing persists.
  }, []);

  const markAllSeen = useCallback(() => (/** @type {any} */ (dispatch))({ type: 'markAllSeen' }), []);
  const dismiss = useCallback((id) => (/** @type {any} */ (dispatch))({ type: 'dismiss', id }), []);
  const clear = useCallback(() => (/** @type {any} */ (dispatch))({ type: 'clear' }), []);

  const value = useMemo(
    () => ({
      notifications: state.items,
      unseenCount: state.unseenCount,
      latest: state.latest,
      markAllSeen,
      dismiss,
      clear,
    }),
    [state, markAllSeen, dismiss, clear],
  );

  return (
    <NotificationsContext.Provider value={value}>
      <Outlet />
    </NotificationsContext.Provider>
  );
}

/**
 * Read the shared session queue. Returns { notifications, unseenCount, latest,
 * markAllSeen, dismiss, clear }. Outside the provider it returns an inert shape.
 */
export function useNotifications() {
  return useContext(NotificationsContext) ?? INERT;
}
