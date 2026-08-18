// src/lib/approvalMonitor.js
//
// Background approval monitor — while the app is open, periodically re-reads
// the local approval and transaction rows and raises an alert for a newly-seen
// approval to a flagged spender, a newly-seen unlimited approval, or an
// incoming transfer from a flagged address. Verdicts come from the existing
// threatIntelStore.
//
// LOCAL-FIRST: the two fetchers are injected by the caller and read the SAME
// local entity stores the pages already read (TokenApproval, Transaction) — no
// new backend surface and no new egress. Alerts live in memory only and are
// surfaced via the useApprovalMonitor hook.
//
// Started from src/hooks/useBackgroundSecurity.js, which is its ONLY caller.
// Without that call this module is inert — it previously shipped described as a
// running feature while nothing started it, and no test went red.
//
// I3: no polling in deniability/demo, AND already-collected alerts are dropped
//     — they name real counterparties, so gating the poll alone is not enough.
// I4: a polling failure is silently retried, never presented as "all clear",
//     and no alert is never evidence that nothing happened.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { lookupThreatSync } from '@/lib/threatIntelStore';

/**
 * lookupThreatSync returns an ARRAY of matches and `[]` on a miss — and `[]` is
 * truthy, so `if (lookupThreatSync(a))` is ALWAYS true. Unwrap through here so
 * a clean address can never be reported as flagged.
 * @param {string} address
 * @returns {{note?: string, category?: string, severity?: string}|null}
 */
function firstThreat(address) {
  const hits = lookupThreatSync(address);
  return Array.isArray(hits) && hits.length > 0 ? hits[0] : null;
}

const DEFAULT_INTERVAL_MS = 60_000;
const MAX_ALERTS = 50;

const ALERT_TYPE = Object.freeze({
  NEW_APPROVAL: 'new_approval',
  RISKY_INCOMING: 'risky_incoming',
  UNLIMITED_APPROVAL: 'unlimited_approval',
});

// _alerts is the snapshot itself, never mutated in place — every mutator
// REPLACES it. useSyncExternalStore compares snapshots with Object.is, so
// getAlerts must hand back this exact reference: returning a fresh copy makes
// every render look like a change and spins React into an infinite loop.
/** @type {ReadonlyArray<any>} */
const EMPTY_ALERTS = Object.freeze([]);
/** @type {ReadonlyArray<any>} */
let _alerts = EMPTY_ALERTS;
/** @type {Set<() => void>} */
let _listeners = new Set();
/** @type {ReturnType<typeof setInterval>|null} */
let _timer = null;
let _running = false;

function notify() {
  // Listeners are notified that SOMETHING changed and re-read via getAlerts();
  // the snapshot is deliberately not passed as an argument, so there is only
  // one way to read it.
  for (const fn of _listeners) {
    try { fn(); } catch { /* listener error is not our problem */ }
  }
}

// Monotonic, process-local. `ts` is NOT unique — a poll can push several alerts
// inside the same millisecond, which would collide as a React key and make
// dismissAlert remove more than the one that was clicked.
let _nextId = 1;

function pushAlert(alert) {
  _alerts = [{ id: _nextId++, ...alert }, ..._alerts].slice(0, MAX_ALERTS);
  notify();
}

function isUnlimited(rawAmount) {
  if (!rawAmount) return false;
  try {
    return BigInt(rawAmount) >= BigInt('0xffffffffffffffffffffffffffffffff');
  } catch { return false; }
}

/**
 * Check a list of approvals for new or risky entries.
 * @param {Array<{spender_address: string, token_symbol: string, allowance_raw: string, status: string, created_date?: string}>} approvals
 * @param {Set<string>} seen - already-alerted approval keys
 */
function scanApprovals(approvals, seen) {
  for (const a of approvals) {
    if (a.status !== 'active') continue;
    const key = `${a.spender_address}:${a.token_symbol}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const threat = firstThreat(a.spender_address);
    if (threat) {
      pushAlert({
        type: ALERT_TYPE.NEW_APPROVAL,
        severity: 'high',
        title: `Approval to flagged address`,
        detail: `${a.token_symbol} approved to ${a.spender_address.slice(0, 8)}…${a.spender_address.slice(-4)} — ${threat.note || threat.category}`,
        spender: a.spender_address,
        token: a.token_symbol,
        threat,
        ts: Date.now(),
      });
    } else if (isUnlimited(a.allowance_raw)) {
      pushAlert({
        type: ALERT_TYPE.UNLIMITED_APPROVAL,
        severity: 'medium',
        title: `Unlimited approval detected`,
        detail: `${a.token_symbol} has an unlimited spending approval to ${a.spender_address.slice(0, 8)}…${a.spender_address.slice(-4)}`,
        spender: a.spender_address,
        token: a.token_symbol,
        ts: Date.now(),
      });
    }
  }
}

/**
 * Check incoming transfers for known-bad senders.
 * @param {Array<{from: string, symbol: string, value: string}>} transfers
 * @param {Set<string>} seen
 */
function scanIncoming(transfers, seen) {
  for (const tx of transfers) {
    const key = `in:${tx.from}:${tx.symbol}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const threat = firstThreat(tx.from);
    if (threat) {
      pushAlert({
        type: ALERT_TYPE.RISKY_INCOMING,
        severity: threat.severity === 'critical' ? 'high' : 'medium',
        title: `Incoming from flagged address`,
        detail: `Received ${tx.symbol} from ${tx.from.slice(0, 8)}…${tx.from.slice(-4)} — ${threat.note || threat.category}`,
        from: tx.from,
        token: tx.symbol,
        threat,
        ts: Date.now(),
      });
    }
  }
}

/**
 * Start the background monitor. Call once from app init.
 * @param {object} opts
 * @param {() => Promise<Array>} opts.fetchApprovals - returns current active approvals
 * @param {() => Promise<Array>} opts.fetchRecentTransfers - returns recent incoming transfers
 * @param {number} [opts.intervalMs]
 */
export function startMonitor({ fetchApprovals, fetchRecentTransfers, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (_running) return;
  _running = true;

  const seenApprovals = new Set();
  const seenTransfers = new Set();

  async function poll() {
    // Gating the POLL is not enough on its own: alerts already collected in a
    // real session would still be readable from a decoy opened in the same page
    // lifetime. Drop the residue as well as skipping the work (I3).
    if (isDeniabilityOrDemoActive()) {
      seenApprovals.clear();
      seenTransfers.clear();
      clearAlerts();
      return;
    }
    try {
      const [approvals, transfers] = await Promise.all([
        fetchApprovals().catch(() => []),
        fetchRecentTransfers().catch(() => []),
      ]);
      scanApprovals(approvals, seenApprovals);
      scanIncoming(transfers, seenTransfers);
    } catch { /* I4: retry next cycle, never assume clean */ }
  }

  poll();
  _timer = setInterval(poll, intervalMs);
}

/**
 * Stop polling AND drop every collected alert. Alerts carry real counterparty
 * addresses, so teardown (lock, panic wipe, entering deniability) must clear
 * them — stopping the timer alone leaves the residue readable.
 */
export function stopMonitor() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _running = false;
  clearAlerts();
}

/**
 * Subscribe to alert changes. `fn` is a change NOTIFICATION and takes no
 * argument — read the current value with getAlerts(). It is deliberately not
 * invoked here: useSyncExternalStore reads the snapshot itself after
 * subscribing, and calling back synchronously only forces an extra render.
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeAlerts(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** @returns {ReadonlyArray<any>} the current snapshot — a stable reference. */
export function getAlerts() { return _alerts; }

/** @param {number} id the alert's `id` (NOT its `ts` — timestamps collide). */
export function dismissAlert(id) {
  const next = _alerts.filter(a => a.id !== id);
  if (next.length === _alerts.length) return; // no change → no new snapshot
  _alerts = next;
  notify();
}

export function clearAlerts() {
  if (_alerts.length === 0) return; // already empty → keep the same snapshot
  _alerts = EMPTY_ALERTS;
  notify();
}

export { ALERT_TYPE };
