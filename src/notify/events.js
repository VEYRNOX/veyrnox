// src/notify/events.js
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief §3 (event-source adapters) + §4 (event set) + §2 (I1–I5).
//
// A SELF-CONTAINED, in-memory pub/sub. No network, no storage, no backend — the
// only "subscribe" pattern in this module. (Deliberately NOT the base44-backed
// usePriceAlertNotifier pattern, which reaches a backend; that would violate
// I2/I3/I5.) Subscribers receive raw event objects; useNotifications maps them
// via buildNotification.
//
// The per-event helpers below are the THIN PUSH-POINTS the live flows will call
// in a follow-up PR (send-broadcast receipt -> emitSendConfirmed; active-set
// balance poll -> emitReceiveDetected; risk composite -> emitRiskFired). This PR
// wires no live source — the seam exists so wiring touches one call site each and
// never widens the I2 basket here.
//
// I4 (fail closed): emit() isolates every subscriber in try/catch and NEVER
// rethrows. A failure in the notification path is dropped silently; it can never
// propagate back to block a tx broadcast or an unlock.
//
// HONEST-DISABLED: there is intentionally NO approval emitter. approve() is not
// exposed anywhere (src/wallet-core/evm/token-send.js:16-17 — unlimited approvals
// are the #1 drain vector, blocked on principle), so there is no on-device approval
// action to bind to. notify.js carries the pure approval->message mapping for the
// day a source honestly exists; we do not fabricate one here.
//
// TAG DISTINCTION (brief §4/§8): approval is HONEST-DISABLED — deliberately
// not-wired-by-design, the same tag as audit-log / login-activity. This is NOT
// the same as the PROVISIONAL tier (built, independent audit complete — ECC
// 2026-06-23 — still not 'verified'). The send/receive/risk seams below ARE that
// PROVISIONAL tier: built, with live wiring landed in PR-2 (see sources.js).
// Approval has no PR-2 — it has no source.

import { EVENT } from './notify.js';
import { LEVEL, PRIORITY } from '../risk/levels.js';

const subscribers = new Set();

/**
 * Subscribe to notification events. Returns an unsubscribe function.
 * @param {(event: object) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Internal fan-out. Each subscriber is isolated: a throw is swallowed so it can
// neither break delivery to the others nor escape to the emitting caller (I4).
function emit(event) {
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch {
      // Drop silently. A broken notification never blocks the originating action.
    }
  }
}

// --- Thin push-points (call sites for the follow-up live wiring) -------------

/** Send broadcast confirmed. `to`/`amount` are the active set's own tx values. */
export function emitSendConfirmed({ ts, amount, to }) {
  emit({ type: EVENT.SEND_CONFIRMED, ts, amount, to });
}

/** Active-set receive detected (reads the active set's own addresses only — I2). */
export function emitReceiveDetected({ ts, amount }) {
  emit({ type: EVENT.RECEIVE_DETECTED, ts, amount });
}

/**
 * Risk composite fired. Only notification-worthy at >= CAUTION (brief §4); OK/INFO
 * verdicts are not surfaced as notifications.
 */
export function emitRiskFired({ ts, score }) {
  if (!score || (PRIORITY[score.level] ?? 0) < PRIORITY[LEVEL.CAUTION]) return;
  emit({ type: EVENT.RISK_FIRED, ts, score });
}
