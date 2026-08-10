// @ts-nocheck
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

// Parse a decimal string like "12345.6789" into { value: BigInt, decimals: number }
// PRESERVING every digit. This avoids the Number()/parseFloat() precision loss on
// wallet-scale amounts. Trailing zeros in the fraction are preserved so two
// values with different literal decimal representations still compare correctly
// after alignment. Returns null on non-numeric input.
function parseDecimalToBig(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [intPart, fracPart = ''] = body.split('.');
  const value = BigInt(intPart + fracPart);
  return { value: neg ? -value : value, decimals: fracPart.length };
}

// Align two { value, decimals } bigint-decimals to the same scale so they can
// be compared and ratioed as pure integers.
function alignBig(a, b) {
  const dec = Math.max(a.decimals, b.decimals);
  const scaleA = 10n ** BigInt(dec - a.decimals);
  const scaleB = 10n ** BigInt(dec - b.decimals);
  return { a: a.value * scaleA, b: b.value * scaleB, decimals: dec };
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
  // OPTIONAL bigint inputs (2026-08 audit). When present, the balance-fraction
  // check uses full-precision bigint arithmetic; otherwise the legacy
  // amt/balanceNum float ratio is used unchanged. Callers that pass wei must
  // also pass `decimals` (18 for native ETH). Token callers can instead pass
  // `amountDecimalStr` / `balanceDecimalStr` which are scaled and compared as
  // aligned bigints without needing a shared decimals value.
  amountWei = null,
  balanceWei = null,
  decimals = null,
  amountDecimalStr = null,
  balanceDecimalStr = null,
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

  // Bigint-precise "amt >= FRACTION * balance" test. Returns true when a
  // precision-preserving comparison confirms the fraction; returns null when
  // no bigint inputs are available (caller should fall back to the float
  // check). Never returns false as "definitely below" — it always defers to
  // the caller's float path when it lacks bigint inputs, so no silent
  // downgrade of the pre-existing behaviour.
  const bigLargeVsBalance = (fraction) => {
    // Native / wei path.
    if (typeof amountWei === 'bigint' && typeof balanceWei === 'bigint' && balanceWei > 0n) {
      // amt/bal >= fraction  <=>  amt * 1000 >= bal * (fraction*1000)
      const permille = BigInt(Math.round(fraction * 1000));
      return amountWei * 1000n >= balanceWei * permille;
    }
    // Token decimal-string path.
    const a = parseDecimalToBig(amountDecimalStr);
    const b = parseDecimalToBig(balanceDecimalStr);
    if (a && b && b.value > 0n) {
      const aligned = alignBig(a, b);
      const permille = BigInt(Math.round(fraction * 1000));
      return aligned.a * 1000n >= aligned.b * permille;
    }
    return null;
  };

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
        'This lets the spender move up to the approved amount later, with no further ' +
        'signature from you. ' +
        (spenderNew ? "You've never approved this spender before. " : '') +
        'Only approve a contract you trust.',
    });
    return risks; // approve moves no funds NOW — the amount rules below don't apply
  }

  // Amount-bearing kinds only past here.
  if (!Number.isFinite(amt) || amt <= 0) return risks;

  const isNewRecipient = recipient && !known.has(recipient);
  const largeVsHistory = hasBaseline && amt >= multiple * baseline;
  // Prefer the bigint-precise check when we have the inputs (see comment on
  // bigLargeVsBalance). Fall back to the float ratio only when bigint inputs
  // are absent — pre-existing behaviour for callers not yet updated.
  const bigVerdict = bigLargeVsBalance(NEW_RECIPIENT_BALANCE_FRACTION);
  const largeVsBalance = bigVerdict !== null
    ? bigVerdict
    : (Number.isFinite(balanceNum) && balanceNum > 0 && amt / balanceNum >= NEW_RECIPIENT_BALANCE_FRACTION);

  // --- unusual amount vs the user's OWN history ---
  // Distinct from simulate.js's large-outflow check (which is vs BALANCE): this is
  // vs your TYPICAL transfer size, so it fires even on a well-funded wallet.
  if (largeVsHistory) {
    risks.push({
      level: 'medium',
      code: 'amount_vs_history',
      title: `Much larger than your usual ${sym} send`,
      detail:
        `~${Math.round(amt / baseline)}× your typical ${sym} send (~${fmt(baseline)} ${sym}). ` +
        `A sudden jump can mean a wrong amount or a drain — confirm it's intended.`,
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
        `First time sending here, and it's a large amount` +
        (largeVsBalance ? ` (~${Math.round((amt / balanceNum) * 100)}% of your ${sym} balance)` : '') +
        `. New payee + high value is a common scam or mistake — double-check the full address and amount.`,
    });
  } else if (isNewRecipient && known.size >= minHistory) {
    // Quietly note a brand-new payee once the user has an established set of
    // counterparties. Info-level — common and not itself a problem.
    risks.push({
      level: 'info',
      code: 'new_recipient',
      title: 'First-time recipient',
      detail:
        "First time sending here. Usually fine — just confirm the full address " +
        'came from a trusted source.',
    });
  }

  return risks;
}

export const ANOMALY_CONSTANTS = { ANOMALY_MULTIPLE, MIN_HISTORY, NEW_RECIPIENT_BALANCE_FRACTION };
