// src/notify/useNotifications.js
//
// In-app Notifications v1 (transient, Path A) — UNAUDITED-PROVISIONAL.
// Build brief §3 (React hook: in-memory queue, session-scoped).
//
// Thin React glue: wires the pure queue reducer (queue.js) to useReducer and
// subscribes to the in-memory emitter (events.js). All real logic lives in the
// pure modules so it is unit-testable without a render harness; this file only
// connects them.
//
// Session lifecycle: state starts at `initialQueue` and is NEVER hydrated from a
// store. The subscription is dropped on unmount, and a lock/reload unmounts the
// tree — so the queue and the badge do not survive (same lifecycle as the in-memory
// auth state cleared by the PIN gate). `clear()` is exposed for an explicit lock.
//
// I4 (fail closed): a malformed event whose buildNotification throws is dropped
// silently here; it never reaches the queue and never disturbs the emitting flow.

import { useReducer, useEffect, useCallback } from 'react';
import { subscribe } from './events.js';
import { buildNotification } from './notify.js';
import { queueReducer, initialQueue } from './queue.js';

export function useNotifications() {
  const [state, dispatch] = useReducer(queueReducer, initialQueue);

  useEffect(() => {
    const unsub = subscribe((event) => {
      let notification;
      try {
        notification = buildNotification(event);
      } catch {
        return; // I4: drop a malformed event; never degrade or block.
      }
      dispatch({ type: 'push', notification });
    });
    return unsub; // discard on unmount (lock/reload) — nothing persists.
  }, []);

  const markAllSeen = useCallback(() => dispatch({ type: 'markAllSeen' }), []);
  const dismiss = useCallback((id) => dispatch({ type: 'dismiss', id }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return {
    notifications: state.items,
    unseenCount: state.unseenCount,
    latest: state.latest,
    markAllSeen,
    dismiss,
    clear,
  };
}
