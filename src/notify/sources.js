// src/notify/sources.js
//
// In-app Notifications v1 (transient, Path A) — UNAUDITED-PROVISIONAL.
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
// ── SCOPE OF THIS PR (honest) ────────────────────────────────────────────────
// Only the SEND source is wired, because only it has a clean, already-existing
// trigger: the post-broadcast 1-conf receipt in SendCrypto. The other two live
// sources the PR-2 brief names are deliberately NOT wired here, and the reasons
// are recorded so the next change starts from the truth, not the brief's
// assumption:
//
//   RECEIVE  (emitReceiveDetected) — HONEST-DISABLED in PR-2.
//     The brief assumes a single "active-set balance poll" to take a positive
//     delta on. There isn't one. The only background balance poll is
//     usePortfolio (lib/portfolioBalances.js), which aggregates ALL vault
//     wallets, not just the active set — so a delta there is an I3 (deniability)
//     scoping decision, not a one-line wiring edit. Detecting a receive also
//     needs prior-balance memory across polls. That is a separate scoped change
//     (still delta-on-existing-poll per §4 — no new read), not smuggled in here.
//
//   RISK     (emitRiskFired) — HONEST-DISABLED in PR-2.
//     The brief assumes "the existing pre-sign evaluation point" where the risk
//     composite resolves >= CAUTION. That point does not exist: src/risk/score.js
//     is not called anywhere in live code (only its own tests + the read-only
//     verify-risk scripts). The Send screen's pre-sign preview uses
//     simulateEvmTransaction + screenRecipient, NOT score(). Making this emit
//     fire for real first requires wiring score() into the signing path — an
//     audit-critical capability change, explicitly out of scope for a wiring PR
//     (brief §10; CLAUDE.md: no fake security, one moving part at a time).
//
// notify.js still carries the pure receive/risk mappings for the day a real
// source exists; we do not fabricate a source to make the emit look live.

import { emitSendConfirmed } from './events.js';

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
