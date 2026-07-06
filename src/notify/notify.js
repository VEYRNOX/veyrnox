// src/notify/notify.js
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief §3 (pure mapper) + §4 (event set) + §5 (one object per event).
//
// PURE: event in, notification object out. No I/O, no network, no storage, no
// React, no signer, no seed. Unit-testable in isolation. The caller supplies
// `ts` (we never call Date.now/Math.random here) so the output — including the
// derived id — is deterministic and reproducible.
//
// I3 (deniability): a notification describes ONLY an event the active set itself
// produced. The output shape is identical regardless of which set is active, and
// copy carries no credential-type word (real/duress/decoy/hidden). The risk
// sentence is sourced verbatim from the risk module, which already guarantees
// this (see src/risk/__tests__/i3-deniability.test.js).
//
// I4 (fail closed): buildNotification THROWS on a malformed/unknown event. The
// caller (events.js subscriber / useNotifications) catches it and DROPS the
// notification — a bad event never produces a degraded/global notification and
// never blocks a tx or unlock path.

import { LEVEL } from '../risk/levels.js';

// The v1 event set (brief §4). All four are on-device, active-set-scoped.
export const EVENT = Object.freeze({
  SEND_CONFIRMED: 'SEND_CONFIRMED',
  RECEIVE_DETECTED: 'RECEIVE_DETECTED',
  RISK_FIRED: 'RISK_FIRED',
  APPROVAL_GRANTED: 'APPROVAL_GRANTED',
});

// Display levels -> design-system tokens (--info / --caution / --risk). Mirrors
// the risk module's level set so one token color is used consistently across the
// send/risk surfaces and these notifications.
export const NOTIFY_LEVEL = Object.freeze({
  INFO: 'info',
  CAUTION: 'caution',
  RISK: 'risk',
});

// Map a risk-module LEVEL onto a display level, mirroring score.js's reportLevel:
// INDETERMINATE escalates to CAUTION (fail-closed) — an un-evaluable check can
// never read as low-attention.
function riskLevelToDisplay(riskLevel) {
  switch (riskLevel) {
    case LEVEL.RISK:
      return NOTIFY_LEVEL.RISK;
    case LEVEL.CAUTION:
    case LEVEL.INDETERMINATE:
      return NOTIFY_LEVEL.CAUTION;
    default: // OK / INFO
      return NOTIFY_LEVEL.INFO;
  }
}

// A compact, stable serialization of the evidence values used to derive a
// deterministic id. Pure: sorts keys, never reads the clock.
function evidenceKey(evidence) {
  return Object.keys(evidence)
    .sort()
    .map((k) => `${k}=${evidence[k] ?? ''}`)
    .join('|');
}

/**
 * Map a single on-device event to one notification object.
 *
 * @param {object} event  { type, ts, ...payload }
 * @returns {{ id: string, level: string, message: string, ts: number, evidence: object }}
 * @throws if the event is null/malformed or of an unknown type (caller fails closed)
 */
export function buildNotification(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('buildNotification: event must be an object');
  }
  const { type, ts } = event;

  let level;
  let message;
  let evidence;

  switch (type) {
    case EVENT.SEND_CONFIRMED:
      level = NOTIFY_LEVEL.INFO;
      message = 'Send confirmed';
      evidence = { amount: event.amount, to: event.to };
      break;

    case EVENT.RECEIVE_DETECTED:
      level = NOTIFY_LEVEL.INFO;
      message = 'Received funds';
      evidence = { amount: event.amount };
      break;

    case EVENT.RISK_FIRED: {
      // Inherit the risk module's own verdict verbatim (level + the ONE sentence).
      const s = event.score;
      if (!s || typeof s !== 'object') {
        throw new Error('buildNotification: RISK_FIRED requires a score result');
      }
      level = riskLevelToDisplay(s.level);
      message = s.sentence;
      evidence = { reason: s.sentence };
      break;
    }

    case EVENT.APPROVAL_GRANTED:
      // Pure mapping only. v1 wires NO approval source — approve() is deliberately
      // not exposed (src/wallet-core/evm/token-send.js). See events.js.
      level = NOTIFY_LEVEL.CAUTION;
      message = 'Token approval granted';
      evidence = { spender: event.spender };
      break;

    default:
      throw new Error(`buildNotification: unknown event type "${type}"`);
  }

  return {
    id: `${type}:${ts}:${evidenceKey(evidence)}`,
    level,
    message,
    ts,
    evidence,
  };
}
