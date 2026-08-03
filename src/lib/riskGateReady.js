// @ts-nocheck
// lib/riskGateReady.js — when has the send-risk verdict actually been decided?
//
// Audit 2026-08-03 H-1 / L-4. SendCrypto computed readiness as
//
//   riskReady = DEMO || !!txSim.data || txSim.isError || !simEnabled
//
// which is a statement about ONE contributor (the EVM simulation) standing in
// for all of them. Two defects fell out of that:
//
//   H-1  It never consulted the TIP remote-screening query, so a send could be
//        judged while threat screening was still in flight. `s9TipThreat`
//        returns OK when `tipResult` is absent, so "not answered yet" scored
//        identically to "answered, clean" — a fail-open with no signal. For
//        BTC/SOL, where S9 is the sole contributor, that meant no threat
//        protection at all on a send the user had explicitly opted in to screen.
//
//   L-4  `txSim` is EVM-only. On a BTC/SOL send with the simulation toggle on it
//        never runs, so `!!txSim.data || txSim.isError` stayed false forever and
//        the send was permanently blocked (fail-closed, but broken).
//
// The rule, stated once: the verdict is ready when EVERY contributor that
// actually applies to this send has settled. A contributor that does not apply
// cannot block; one that does must produce a terminal result first.
//
// NOTE for anyone tempted to simplify this back to `!!query.data`: don't.
// `screenTransaction()` legitimately resolves to `null` — in deniability/demo,
// and whenever TIP is unconfigured, which is every build today. Keying readiness
// off the payload rather than the settled state would leave those builds
// permanently blocked on every send with screening enabled.

/**
 * @typedef {{ isSuccess?: boolean, isError?: boolean }} QueryState
 * @typedef {{ applies?: boolean, query?: QueryState|null }} Contributor
 */

/**
 * Has one risk contributor reached a terminal state?
 *
 * Fails closed: an applicable contributor with no query state is treated as
 * unsettled rather than assumed done.
 *
 * @param {Contributor} contributor
 * @returns {boolean}
 */
export function contributorSettled(contributor) {
  if (!contributor || typeof contributor !== 'object') return false;
  if (contributor.applies !== true) return true;
  const q = contributor.query;
  if (!q || typeof q !== 'object') return false;
  // Settled means the query reached a terminal state — NOT that it returned a
  // truthy payload. An error counts: the error path scores CAUTION downstream,
  // and the gate must not hang on a query that will never succeed.
  return q.isSuccess === true || q.isError === true;
}

/**
 * Is the composite risk verdict safe to act on yet?
 *
 * @param {{ demo?: boolean, contributors?: Contributor[] }} [opts]
 * @returns {boolean}
 */
export function isRiskGateReady(opts = {}) {
  const { demo = false, contributors = [] } = opts || {};
  if (demo === true) return true;
  if (!Array.isArray(contributors)) return false; // fail closed on a malformed call
  return contributors.every(contributorSettled);
}
