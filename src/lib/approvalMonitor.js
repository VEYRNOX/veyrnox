// src/lib/approvalMonitor.js
//
// Background approval monitor — periodically polls for new ERC-20 approvals
// and incoming transfers from known-bad addresses. Feeds into the existing
// threatIntelStore + risk scoring pipeline.
//
// LOCAL-FIRST: polling reads on-chain data the wallet already queries
// (balances, approval events). No new backend surface. Alerts are stored
// in-memory and surfaced via the useApprovalMonitor hook.
//
// I3: suppressed in deniability/demo — no polling, no alerts.
// I4: a polling failure is silently retried, never presented as "all clear".

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { lookupThreatSync } from '@/lib/threatIntelStore';

const DEFAULT_INTERVAL_MS = 60_000;
const MAX_ALERTS = 50;

const ALERT_TYPE = Object.freeze({
  NEW_APPROVAL: 'new_approval',
  RISKY_INCOMING: 'risky_incoming',
  UNLIMITED_APPROVAL: 'unlimited_approval',
});

let _alerts = [];
let _listeners = new Set();
let _timer = null;
let _running = false;

function notify() {
  for (const fn of _listeners) {
    try { fn([..._alerts]); } catch { /* listener error is not our problem */ }
  }
}

function pushAlert(alert) {
  _alerts = [alert, ..._alerts].slice(0, MAX_ALERTS);
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

    const threat = lookupThreatSync(a.spender_address);
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

    const threat = lookupThreatSync(tx.from);
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
    if (isDeniabilityOrDemoActive()) return;
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

export function stopMonitor() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _running = false;
}

/**
 * Subscribe to alert changes.
 * @param {(alerts: Array) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeAlerts(fn) {
  _listeners.add(fn);
  fn([..._alerts]);
  return () => _listeners.delete(fn);
}

export function getAlerts() { return [..._alerts]; }

export function dismissAlert(ts) {
  _alerts = _alerts.filter(a => a.ts !== ts);
  notify();
}

export function clearAlerts() {
  _alerts = [];
  notify();
}

export { ALERT_TYPE };
