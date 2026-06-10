// src/notify/queue.js
//
// In-app Notifications v1 (transient, Path A) — UNAUDITED-PROVISIONAL.
// Build brief §5 (queue behaviour) + §2 D-set (no persistence, no cardinality leak).
//
// The notification queue as a PURE reducer + initial state, kept out of the React
// hook so the session/badge logic is unit-testable without a render harness. The
// hook (useNotifications.js) just wires this reducer to useReducer and subscribes
// to events.js.
//
// Session-scoped by construction: `initialQueue` is a frozen literal that is never
// hydrated from any store, and `clear` returns to it. There is no disk/localStorage
// write anywhere in this module — that absence is the property that keeps Path A
// safe (nothing to forensically recover) and is asserted by zeroWrite.test.js.

// Memory bound only — NOT a retention feature. Caps how many notifications we hold
// in RAM this session; the oldest is evicted past the cap.
export const RING_CAP = 20;

export const initialQueue = Object.freeze({
  items: [], // newest-first
  unseenCount: 0, // badge — THIS session's unseen count only (no per-set tally)
  latest: null, // the most recent notification, surfaced as a transient toast
});

/**
 * Pure reducer for the in-memory notification queue.
 *
 * Actions:
 *   { type: 'push', notification }  add a notification (newest-first, ring-capped)
 *   { type: 'markAllSeen' }         reset the unseen badge to zero (items kept)
 *   { type: 'dismiss', id }         remove one item; clear the toast if it was latest
 *   { type: 'clear' }               wipe back to initial (lock/reload lifecycle)
 *
 * Unknown actions return the SAME state reference (no spurious re-render).
 */
export function queueReducer(state, action) {
  switch (action.type) {
    case 'push': {
      const items = [action.notification, ...state.items].slice(0, RING_CAP);
      return { items, unseenCount: state.unseenCount + 1, latest: action.notification };
    }
    case 'markAllSeen':
      if (state.unseenCount === 0) return state;
      return { ...state, unseenCount: 0 };
    case 'dismiss': {
      const items = state.items.filter((n) => n.id !== action.id);
      const latest = state.latest && state.latest.id === action.id ? null : state.latest;
      return { ...state, items, latest };
    }
    case 'clear':
      return initialQueue;
    default:
      return state;
  }
}
