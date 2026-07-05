// src/notify/sources.js
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief PR-2 §3 (the live edits) + §2 I4 (fail honest / fail closed).
//
// CALL-SITE ADAPTERS for the live event sources. Each wraps the corresponding
// events.js push-point in a try/catch so the emit is PROVABLY a side-effect: a
// throw here can never unwind the originating flow (send / unlock / poll). This
// is the load-bearing fail-closed guarantee of PR-2 (§7) — the emit is on no
// critical path. events.js already isolates each subscriber; this is the second
// belt: even a synchronous throw constructing/dispatching the event is swallowed.
//
// PURE wrt I/O: no storage, no network, no signer, no seed — only an in-memory
// dispatch. Covered by zeroWrite.test.js (it scans this whole directory).
//
// ── SOURCES WIRED ────────────────────────────────────────────────────────────
// All three live sources from the PR-2 brief are now wired:
//
//   SEND    (notifySendConfirmed)   — post-broadcast receipt in SendCrypto.
//   RECEIVE (notifyReceiveDetected) — usePortfolio poll delta in WalletPortfolioPage.
//                                     Guards: isUnlocked && !isDecoy (I3, no-fake-security).
//                                     Skips indeterminate reads. First poll = baseline only.
//   RISK    (notifyTxRiskAlert)     — scoreCurrentSend() verdict at sign time in SendCrypto.
//                                     Only fires for CAUTION/RISK level (emitRiskFired guards too).
//           (notifyRaspAlert)       — RASP environment tier at sign time (WARN/BLOCK only).
//           (notifyFraudAlert)      — fraud scan findings (critical/high severity only).

import { emitSendConfirmed, emitReceiveDetected, emitRiskFired } from './events.js';
import { LEVEL, PRIORITY } from '../risk/levels.js';

/**
 * Fire the "send confirmed" notification from the send flow's post-broadcast
 * receipt. Fire-and-forget: returns true if the emit dispatched cleanly, false
 * if it was swallowed (I4) — the caller ignores the return; a notification
 * failure must never alter or unwind the send.
 *
 * @param {{ amount: string, to: string, ts: number }} p  display values + caller ts
 *   `amount` is a display string (e.g. "0.5 ETH"); `to` is the recipient address
 *   (the component truncates it). `ts` is supplied by the caller so the mapper
 *   stays clock-/rng-free.
 * @returns {boolean}
 */
export function notifySendConfirmed({ amount, to, ts }) {
  try {
    emitSendConfirmed({ ts, amount, to });
    return true;
  } catch {
    return false; // I4: a notification failure never unwinds the send path.
  }
}

/**
 * Fire a "receive detected" notification from the portfolio balance poll delta.
 * Guard: call only when isUnlocked && !isDecoy — fake balances in demo/decoy
 * sessions must never trigger a real notification (I3, no-fake-security).
 *
 * @param {{ amount: string, ts: number }} p  display string + caller ts
 */
export function notifyReceiveDetected({ amount, ts }) {
  if (!amount) return false;
  try {
    emitReceiveDetected({ ts, amount });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire a risk notification from the tx-risk composite score at signing time.
 * Only fires for CAUTION or RISK — OK/INFO stay silent (emitRiskFired guards too).
 *
 * @param {{ level: string, sentence: string|null, signalId: string|null, ts: number }} p
 */
export function notifyTxRiskAlert({ level, sentence, signalId, ts }) {
  if (!level || (PRIORITY[level] ?? 0) < PRIORITY[LEVEL.CAUTION]) return false;
  try {
    emitRiskFired({ ts, score: { level, sentence: sentence ?? signalId ?? 'Risk signal detected' } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire a security alert from the RASP environment gate when tier is WARN or BLOCK.
 * ALLOW → no-op. Call once per send attempt, not on every render.
 *
 * @param {{ tier: string, sentence: string|null, ts: number }} p
 */
export function notifyRaspAlert({ tier, sentence, ts }) {
  if (tier === 'allow' || !sentence) return false;
  try {
    const level = tier === 'warn-before-sign' ? LEVEL.CAUTION : LEVEL.RISK;
    emitRiskFired({ ts, score: { level, sentence } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire a risk alert from an on-device fraud/anomaly scan finding.
 * Only fires for critical or high severity (medium/low stay in the scan UI only).
 *
 * @param {{ sentence: string, severity: string, ts: number }} p
 */
export function notifyFraudAlert({ sentence, severity, ts }) {
  if (!sentence || (severity !== 'critical' && severity !== 'high')) return false;
  try {
    const level = severity === 'critical' ? LEVEL.RISK : LEVEL.CAUTION;
    emitRiskFired({ ts, score: { level, sentence } });
    return true;
  } catch {
    return false;
  }
}
