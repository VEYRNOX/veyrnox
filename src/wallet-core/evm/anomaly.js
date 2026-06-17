// wallet-core/evm/anomaly.js
//
// Anomaly / Fraud Detection (Phase S2 — the LAST transaction-safety item). LOCAL,
// rule-based heuristics that COMPLEMENT the pre-sign simulation (evm/simulate.js)
// by comparing a transaction against THIS user's OWN on-device history. Where
// simulate.js asks "what will this do, and does it match a known-bad pattern?",
// this asks "does this DEVIATE from how YOU normally transact?" — the signal that
// catches a draining/mistaken transfer a static rule alone would miss.
//
// NOT A NEW ENGINE — this composes existing local signals. It reuses the same
// risk-object shape ({ level, code, title, detail }) the simulator emits, so its
// findings render in the SAME TransactionPreview with no new surface, and it runs
// inside assessEvmTransaction alongside the balance/contract/poison checks.
//
// LOCAL-ONLY — NO third-party scoring, NO phone-home:
//   Every input is data the wallet already holds on-device: the user's own
//   transaction history (the local Transaction store / demo seed), their address
//   book + whitelist, and balances already read for the simulation. This file
//   makes NO network calls of its own. It is the explicit OPPOSITE of the remote
//   telemetry-scoring model the product's privacy wedge rejects.
//
// HONESTY (mirrors simulate.js):
//   - WARN, never block. We surface a flag; the user still decides.
//   - NEVER assert "safe". No deviation found is NOT a guarantee — a first large
//     send to a new payee can be perfectly legitimate, and a novel attack that
//     mimics your habits would raise nothing here. The UI says so.
//   - Coverage is KNOWN local deviations only; this is NOT equivalent to a
//     commercial telemetry feed and will not catch every novel threat.
//
// Lives under the guarded wallet-core path so the RNG tripwire covers it too. No
// Math.random / Date.now-as-randomness — pure arithmetic over passed-in data.

// An outflow at or above this multiple of the user's TYPICAL (median) send for the
// same asset is "unusually large vs your own history" — worth a flag even when it
// is a small fraction of the balance (e.g. you usually send ~$20, now ~$2000).
const ANOMALY_MULTIPLE = 10;

// Need at least this many prior sends of the asset before a "typical" baseline is
// meaningful. Below it we stay silent (and never imply the amount is normal).
const MIN_HISTORY = 3;

// A first-time recipient receiving at least this fraction of the wallet balance is
// "large" even with no amount baseline — new counterparty + high value is the
// shape worth surfacing on its own.
const NEW_RECIPIENT_BALANCE_FRACTION = 0.5;

// Robust "typical value": the median is resistant to one-off outliers (a single
// large past send won't inflate the baseline the way a mean would).
function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function norm(addr) {
  return typeof addr === 'string' ? addr.toLowerCase() : addr;
}

// Trim a float for display without trailing-zero noise (heuristic copy only —
// never used to move funds).
function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  return parseFloat(n.toFixed(6)).toString();
}

/**
 * PURE history-aware anomaly assessment — NO network, NO keys. Given a decoded
 * outflow and the user's OWN local history, return the deviation flags. Designed
 * to be folded into assessEvmTransaction's risk list (same object shape).
 *
 * @param {object} [p]
 * @param {string} [p.kind]               'native' | 'transfer' | 'approve' | 'unknown'
 * @param {string} [p.effectiveRecipient] who gains value (transfer/native) or power (approve)
 * @param {number} [p.amount]             outflow in DISPLAY units (transfer/native); 0/undefined for approve
 * @param {string} [p.symbol]             asset symbol, for copy
 * @param {number} [p.balanceNum]         current balance in display units, for the fraction check
 * @param {Array<number>} [p.priorSends]  past OUTFLOW amounts of the SAME asset (display units)
 * @param {Array<string>} [p.knownCounterparties] addresses the user has transacted with / saved
 * @param {number} [p.multiple]           override ANOMALY_MULTIPLE (testing)
 * @param {number} [p.minHistory]         override MIN_HISTORY (testing)
 * @returns {Array<{level:'high'|'medium'|'info', code:string, title:string, detail:string}>}
 */
export function assessHistoryAnomalies({
  kind = 'native',
  effectiveRecipient = null,
  amount = 0,
  symbol = null,
  balanceNum = null,
  priorSends = [],
  knownCounterparties = [],
  multiple = ANOMALY_MULTIPLE,
  minHistory = MIN_HISTORY,
} = {}) {
  /** @type {Array<{level:'high'|'medium'|'info', code:string, title:string, detail:string}>} */
  const risks = [];
  const sym = symbol || 'this asset';
  const known = new Set((knownCounterparties || []).map(norm).filter(Boolean));
  const recipient = norm(effectiveRecipient);
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  const baseline = median(priorSends);
  const hasBaseline = baseline != null && priorSends.length >= minHistory;

  // --- approve: the two-step ("second tx is the exploit") drain shape ---
  // Approving a spender is leg ONE: a later transferFrom can move up to the
  // approved amount with NO further signature. Naming the SEQUENCE is additive to
  // the simulator's amount-based unlimited/exact-approval flags.
  if (kind === 'approve') {
    const spenderNew = recipient && !known.has(recipient);
    risks.push({
      level: spenderNew ? 'medium' : 'info',
      code: 'approval_then_transfer',
      title: 'Approval enables a later transfer',
      detail:
        'Approving a spender is the first step of a two-step pattern — a later ' +
        'transferFrom can move up to the approved amount WITHOUT another signature ' +
        'from you. ' +
        (spenderNew ? "You have never transacted with this spender before. " : '') +
        'If you did not just initiate a swap/bridge with a contract you trust, do not approve.',
    });
    return risks; // approve moves no funds NOW — the amount rules below don't apply
  }

  // Amount-bearing kinds only past here.
  if (!Number.isFinite(amt) || amt <= 0) return risks;

  const isNewRecipient = recipient && !known.has(recipient);
  const largeVsHistory = hasBaseline && amt >= multiple * baseline;
  const largeVsBalance =
    Number.isFinite(balanceNum) && balanceNum > 0 && amt / balanceNum >= NEW_RECIPIENT_BALANCE_FRACTION;

  // --- unusual amount vs the user's OWN history ---
  // Distinct from simulate.js's large-outflow check (which is vs BALANCE): this is
  // vs your TYPICAL transfer size, so it fires even on a well-funded wallet.
  if (largeVsHistory) {
    risks.push({
      level: 'medium',
      code: 'amount_vs_history',
      title: `Much larger than your usual ${sym} send`,
      detail:
        `This is ~${Math.round(amt / baseline)}× your typical ${sym} transfer ` +
        `(~${fmt(baseline)} ${sym}, from your own history). A sudden jump in size is a ` +
        `common sign of a mistaken amount or a drain — confirm the amount is intended.`,
    });
  }

  // --- first-time recipient + large amount ---
  // New counterparty alone is common and fine; new counterparty + HIGH VALUE is the
  // combination worth surfacing. "Large" = large vs your history OR vs your balance.
  if (isNewRecipient && (largeVsHistory || largeVsBalance)) {
    risks.push({
      level: 'medium',
      code: 'new_recipient_large',
      title: 'Large amount to a first-time recipient',
      detail:
        `You have never sent to this address before, and this is a large amount` +
        (largeVsBalance ? ` (~${Math.round((amt / balanceNum) * 100)}% of your ${sym} balance)` : '') +
        `. New payee + high value is a frequent scam/mistake shape — double-check the ` +
        `full address and amount before signing.`,
    });
  } else if (isNewRecipient && known.size >= minHistory) {
    // Quietly note a brand-new payee once the user has an established set of
    // counterparties. Info-level — common and not itself a problem.
    risks.push({
      level: 'info',
      code: 'new_recipient',
      title: 'First-time recipient',
      detail:
        "You haven't sent to this address before. That's common and usually fine — " +
        'just confirm you copied the full address from a trusted source.',
    });
  }

  return risks;
}

export const ANOMALY_CONSTANTS = { ANOMALY_MULTIPLE, MIN_HISTORY, NEW_RECIPIENT_BALANCE_FRACTION };
