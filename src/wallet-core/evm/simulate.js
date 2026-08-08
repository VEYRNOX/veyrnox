// @ts-nocheck
// wallet-core/evm/simulate.js
//
// Transaction Simulation (Phase S2 — transaction safety). A pre-sign PREVIEW of
// what an EVM transaction will actually DO, so the user can catch a draining or
// mistaken transaction BEFORE they approve it. The #1 fund-loss vector is users
// signing transactions they didn't understand; this turns the opaque "approve?"
// into a human-readable outcome + a set of KNOWN risk flags.
//
// LOCAL-FIRST — NO third-party scoring service:
//   Everything here runs against the EXISTING, user-trusted/self-hostable RPC
//   (evm/provider.js getProvider). It uses ONLY read-only JSON-RPC methods:
//     - eth_call        : dry-run the tx against current state (detects reverts)
//     - eth_getBalance  : sender's native balance (outflow ratio)
//     - eth_getCode     : is the target / spender a contract? (unverified-contract)
//   It NEVER phones home to Blockaid/Tenderly/etc. and never sends the user's
//   intent to any scoring API. The recipient/look-alike screening reuses the
//   purely-local poison.js (compares only against the user's own data).
//
// SECURITY POSTURE
//   - NO keys, NO signing. Simulation needs only the sender ADDRESS (eth_call's
//     `from`), never the private key. This is a read; the real signing path
//     (send.js / token-send.js / vault) is untouched.
//   - WARN, NEVER BLOCK, and NEVER assert "safe". Absence of a detected pattern
//     is NOT safety — the UI says so. We surface what we found and let the user
//     decide, matching the existing security-feature philosophy.
//   - Honest coverage: this catches KNOWN patterns (unlimited approval, known-bad
//     / look-alike recipient, unverified contract, predicted revert, large
//     outflow) plus LOCAL anomaly heuristics over the user's OWN history (unusual
//     amount vs typical, large-to-new-recipient, approve-then-transfer — see
//     anomaly.js) and predicts the outcome via simulation. It is NOT equivalent to
//     a commercial telemetry feed and will not catch every novel threat.
//
// Lives under the guarded wallet-core path so the RNG tripwire covers it too.

import { formatEther, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { isDeniabilitySessionActive } from '../deniabilitySession.js';
import { describeErc20Call } from './calldata.js';
import { TOKENS } from './tokens.js';
import { screenRecipient, isLocallyFlagged } from './poison.js';
import { screenAddress, CATEGORY_LABELS } from './suspicious.js';
import { assessHistoryAnomalies } from './anomaly.js';

// Sending at/above this fraction of the asset balance is "drain-like" — worth a
// flag so a user notices an unexpectedly large outflow (a classic drainer move).
const LARGE_OUTFLOW_RATIO = 0.9;

// Coerce a wei-ish value (bigint | number | decimal-free string | null) to BigInt.
function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (v == null) return 0n;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  return BigInt(v);
}

// True if `addr` is one of THIS wallet's verified tokens on the network — i.e. a
// contract we can vouch for. Anything else is "unverified" from our standpoint.
function isKnownTokenAddress(networkKey, addr) {
  const t = TOKENS[networkKey];
  if (!t || !addr) return false;
  const a = String(addr).toLowerCase();
  return Object.values(t).some((x) => String(x.address).toLowerCase() === a);
}

// Upper bound on revert-reason text we will render. A real Error(string)
// revert is a short developer message ("ERC20: transfer amount exceeds
// balance"); anything longer is not more informative, it is just more surface.
const MAX_REVERT_REASON = 140;

/**
 * Bound and flatten a revert reason before it reaches the signing screen.
 *
 * THE REASON IS ATTACKER-CONTROLLED. It arrives in the RPC's response, and the
 * threat is named at the top of this file: a hostile or compromised endpoint
 * "can inject an inflammatory revertReason on a legitimate [transaction]".
 * That text is interpolated into `level: 'high'` copy and rendered by
 * TransactionPreview on the screen where someone decides whether to sign —
 * so it is untrusted input rendered as our own voice.
 *
 * React escapes markup, so this is not XSS. It is CONTENT injection, and the
 * two things that make it convincing are LENGTH (room for a plausible
 * instruction) and STRUCTURE (newlines that fake a separate paragraph, ANSI or
 * control characters that alter how it renders). Both are removed here; the
 * short factual case a reader actually benefits from survives untouched.
 */
function sanitiseRevertReason(raw) {
  if (typeof raw !== 'string') return null;
  // Control chars first (they include \n and \r), then collapse runs of
  // whitespace, so multi-line prose becomes one line rather than one word.
  const flat = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > MAX_REVERT_REASON
    ? `${flat.slice(0, MAX_REVERT_REASON - 1)}…`
    : flat;
}

/**
 * Pull a human-ish revert reason out of an ethers error without throwing.
 *
 * DECODED SOURCES ONLY. `e.reason` is the decoded Error(string) payload and
 * `e.shortMessage` is ethers' own summary of it. `e.info.error.message` and
 * `e.message` were also consulted here, and they are the JSON-RPC TRANSPORT
 * talking, not the contract — they can carry the endpoint URL (including a
 * keyed RPC path) and internal payload detail straight into user-facing copy,
 * which CLAUDE.md A10 forbids. Dropping them costs nothing a user could act
 * on: when neither decoded field is present we render the revert with no
 * reason, which is honest rather than chatty (I4).
 */
function extractRevertReason(e) {
  return sanitiseRevertReason(e?.reason ?? e?.shortMessage ?? null);
}

// Large-outflow heuristic. Returns a risk object or null.
// M-1 fix: native branch uses BigInt arithmetic to avoid Number precision loss
// on wei values > 2^53 — noise near the 0.999 / ratio thresholds was enough to
// misfire at exactly the amounts where the flag matters most.
// ERC-20 branch stays parseFloat (token amounts are always human-scale decimals).
/** @returns {{level:'high'|'medium'|'info', code:string, title:string, detail:string} | null} */
function largeOutflowRisk({ kind, valueWei, nativeBalanceWei, nativeSymbol, decodedAmount, tokenSymbol, tokenBalance, ratio }) {
  if (kind === 'native') {
    const bal = toBig(nativeBalanceWei);
    if (nativeBalanceWei == null || bal <= 0n) return null;
    const valueBig = toBig(valueWei);
    // Use BigInt cross-multiplication to avoid Number precision loss at high wei values.
    // pct1000 = floor(value * 1000 / bal), giving ‰ precision without floats.
    const pct1000 = valueBig * 1000n / bal;
    const ratioThreshold = BigInt(Math.round(ratio * 1000));
    const pctDisplay = Number(valueBig * 100n / bal);
    if (pct1000 >= 999n) {
      return {
        level: 'high',
        code: 'entire_balance',
        title: 'Sends almost your entire balance',
        detail: `This moves ~${pctDisplay}% of your ${nativeSymbol || 'balance'}. Drainers try to empty a wallet in one transaction — confirm this is intended.`,
      };
    }
    if (pct1000 >= ratioThreshold) {
      return {
        level: 'medium',
        code: 'large_outflow',
        title: 'Unusually large outflow',
        detail: `This moves ~${pctDisplay}% of your ${nativeSymbol || 'balance'}. Double-check the amount and recipient.`,
      };
    }
    return null;
  } else if (kind === 'transfer') {
    const bal = parseFloat(tokenBalance);
    const amt = parseFloat(decodedAmount);
    if (!Number.isFinite(bal) || bal <= 0 || !Number.isFinite(amt)) return null;
    const frac = amt / bal;
    if (!Number.isFinite(frac)) return null;
    if (frac >= 0.999) {
      return {
        level: 'high',
        code: 'entire_balance',
        title: 'Sends almost your entire balance',
        detail: `This moves ~${Math.round(frac * 100)}% of your ${tokenSymbol || 'balance'}. Drainers try to empty a wallet in one transaction — confirm this is intended.`,
      };
    }
    if (frac >= ratio) {
      return {
        level: 'medium',
        code: 'large_outflow',
        title: 'Unusually large outflow',
        detail: `This moves ~${Math.round(frac * 100)}% of your ${tokenSymbol || 'balance'}. Double-check the amount and recipient.`,
      };
    }
    return null;
  }
  return null;
}

/**
 * PURE risk + outcome assessment — NO network, NO keys. Given a decoded call and
 * the read-only facts the networked layer (or a demo harness) gathered, produce
 * the predicted balance changes and the list of KNOWN risk flags. This is the
 * testable heart of the simulation.
 *
 * @returns {{
 *   kind: string,
 *   effectiveRecipient: string,
 *   balanceChanges: Array<{label:string,direction:string,amount:string,symbol:string,who?:string}>,
 *   risks: Array<{level:'high'|'medium'|'info', code:string, title:string, detail:string}>,
 * }}
 */
export function assessEvmTransaction({
  decoded = /** @type {any} */ (undefined),
  txTo = /** @type {string} */ (undefined),  // tx `to`: an EOA for native, the token contract for an ERC-20 call
  valueWei = /** @type {bigint|number|string} */ (0n),  // native value attached (0 for token calls)
  nativeBalanceWei = null,    // sender native balance (string|bigint) or null if unknown
  nativeSymbol = 'ETH',
  networkKey = null,
  tokenSymbol = null,
  tokenBalance = null,        // sender's token balance (decimal string) for outflow ratio
  knownAddresses = [],
  targetIsContract = false,   // does the tx `to` have code?
  spenderIsContract = null,   // for approve: does the spender have code?
  largeOutflowRatio = LARGE_OUTFLOW_RATIO,
  priorSends = [],            // past OUTFLOW amounts of the SAME asset (display units) — history baseline
  knownCounterparties = [],   // addresses the user has transacted with / saved — for first-time-recipient
} = {}) {
  /** @type {Array<{level:'high'|'medium'|'info', code:string, title:string, detail:string}>} */
  const risks = [];
  const balanceChanges = [];
  const kind = decoded?.kind || 'native';

  // Who actually receives value / gains power over the user's funds. For a token
  // transfer the tx `to` is the (verified) contract; the VALUE recipient is
  // decoded.to. For approve the spender gains spending power.
  let effectiveRecipient = txTo;
  if (kind === 'transfer') effectiveRecipient = decoded.to;
  else if (kind === 'approve') effectiveRecipient = decoded.spender;

  // ---- predicted balance changes (the "you will send X, receive Y") ----
  if (kind === 'native') {
    const v = toBig(valueWei);
    balanceChanges.push({ label: 'You send', direction: 'out', amount: formatEther(v), symbol: nativeSymbol });
    balanceChanges.push({ label: 'Recipient receives', direction: 'in', amount: formatEther(v), symbol: nativeSymbol, who: effectiveRecipient });
  } else if (kind === 'transfer') {
    balanceChanges.push({ label: 'You send', direction: 'out', amount: decoded.amount, symbol: tokenSymbol });
    balanceChanges.push({ label: 'Recipient receives', direction: 'in', amount: decoded.amount, symbol: tokenSymbol, who: effectiveRecipient });
  }
  // approve / unknown move no funds NOW — the danger is future spend, surfaced as
  // a risk below rather than a balance change (we won't fake a number).

  // ---- KNOWN risk patterns (never asserts safety) ----

  // 1. Approvals — the #1 token-drain vector.
  if (kind === 'approve' && decoded.unlimited) {
    risks.push({
      level: 'high',
      code: 'unlimited_approval',
      title: 'Unlimited token approval',
      detail: `This grants the spender UNLIMITED spending of your ${tokenSymbol || 'tokens'}. A malicious or compromised spender could drain the entire balance now or any time later. Prefer an exact-amount approval and only approve contracts you fully trust.`,
    });
  } else if (kind === 'approve') {
    risks.push({
      level: 'medium',
      code: 'token_approval',
      title: 'Token spending approval',
      detail: `This lets the spender move up to ${decoded.amount} ${tokenSymbol || ''} of your tokens. Revoke it when you're done.`,
    });
  }

  // 2. Recipient on the LOCAL known-bad list (burn/null sinks, known scam sinks).
  if (isLocallyFlagged(effectiveRecipient)) {
    risks.push({
      level: 'high',
      code: 'known_bad_recipient',
      title: 'Recipient on local known-bad list',
      detail: 'This address is on the local flagged list (e.g. a burn/null sink or a known scam sink). Sending here is very likely a mistake or a scam.',
    });
  }

  // 2b. Recipient screened against pluggable blocklist providers. The DEFAULT set
  //     (suspicious.js DEFAULT_PROVIDERS) includes the LOCAL seed blocklist and,
  //     when configured, the Veyrnox TIP runtime provider. WARNS, never blocks,
  //     never asserts "safe". Burn/null sinks are already surfaced by the
  //     known-bad check above, so we skip that category here to avoid a duplicate
  //     warning.
  const screened = screenAddress(effectiveRecipient);
  for (const m of screened.matches) {
    if (m.category === 'burn') continue; // already flagged as known_bad_recipient
    risks.push({
      level: 'high',
      code: 'flagged_recipient',
      title: `Recipient flagged: ${CATEGORY_LABELS[m.category] || 'known bad'}`,
      detail: `${m.note ? `${m.note} ` : ''}Source: ${m.source}. This is a WARNING from a local blocklist — it is not proof of wrongdoing, and an address that is NOT flagged is not proven trustworthy. Verify the recipient independently before sending.`,
    });
  }

  // 3. Look-alike / address-poisoning (LOCAL screen vs the user's own history).
  const screen = screenRecipient(effectiveRecipient, knownAddresses);
  if (screen.suspicious) {
    risks.push({
      level: 'high',
      code: 'look_alike_recipient',
      title: 'Look-alike address (possible poisoning)',
      detail: 'This recipient matches the first and last characters of an address you have used before but differs in the middle — exactly the address-poisoning pattern. Compare every character, not just the ends.',
    });
  }

  // 4. Interacting with an UNVERIFIED contract. For approve, the party gaining
  //    power is the spender; for everything else it's the tx target.
  const counterpartyIsContract = kind === 'approve' ? !!spenderIsContract : !!targetIsContract;
  const counterpartyKnown = kind === 'approve' ? false : isKnownTokenAddress(networkKey, txTo);
  if (counterpartyIsContract && !counterpartyKnown) {
    risks.push({
      level: 'medium',
      code: 'unverified_contract',
      title: 'Unverified contract',
      detail: 'You are interacting with a contract this wallet cannot vouch for (not in its verified list). We cannot confirm what it does — only continue if you trust the source.',
    });
  }

  // 5. Calldata we could not decode at all.
  if (kind === 'unknown') {
    risks.push({
      level: 'high',
      code: 'unrecognized_calldata',
      title: 'Unrecognised contract call',
      detail: "This transaction's data does not match a known token action (transfer/approve). Do not sign unless you know exactly what it does.",
    });
  }

  // 6. Large outflow relative to balance.
  const outflow = largeOutflowRisk({
    kind, valueWei, nativeBalanceWei, nativeSymbol,
    decodedAmount: decoded?.amount, tokenSymbol, tokenBalance, ratio: largeOutflowRatio,
  });
  if (outflow) risks.push(outflow);

  // 7. ANOMALY / FRAUD heuristics vs the user's OWN on-device history (anomaly.js).
  //    Complements the checks above: unusual amount vs your typical send, a large
  //    amount to a first-time recipient, and the approve-then-transferFrom shape.
  //    Pure + local — operates only over passed-in history/balances, no network.
  let outflowAmount = 0;       // outflow in DISPLAY units, for the history comparison
  let balanceNum = null;       // current balance in DISPLAY units, for the fraction check
  if (kind === 'native') {
    outflowAmount = Number(formatEther(toBig(valueWei)));
    if (nativeBalanceWei != null) balanceNum = Number(formatEther(toBig(nativeBalanceWei)));
  } else if (kind === 'transfer') {
    outflowAmount = parseFloat(decoded?.amount);
    if (tokenBalance != null) balanceNum = parseFloat(tokenBalance);
  }
  const anomalies = assessHistoryAnomalies({
    kind,
    effectiveRecipient,
    amount: outflowAmount,
    symbol: kind === 'native' ? nativeSymbol : tokenSymbol,
    balanceNum,
    priorSends,
    knownCounterparties,
  });
  for (const a of anomalies) risks.push(a);

  return { kind, effectiveRecipient, balanceChanges, risks };
}

/**
 * Simulate an EVM transaction against the EXISTING RPC and return a structured
 * preview. Read-only: needs the sender ADDRESS, never the key. Never throws on a
 * reverting tx (that's a RESULT we surface); only throws on a malformed target.
 *
 * @param {object} p
 * @param {string} p.networkKey
 * @param {string} p.from            sender address (eth_call `from`)
 * @param {string} p.to              tx target (EOA for native; token contract for ERC-20)
 * @param {bigint|string|number} [p.valueWei]  native value attached (0 for token calls)
 * @param {string} [p.data]          calldata ('0x'/empty => native send)
 * @param {string} [p.nativeSymbol]  gas/native symbol for display (e.g. 'ETH','POL')
 * @param {string} [p.tokenSymbol]
 * @param {number} [p.tokenDecimals]
 * @param {string} [p.tokenBalance]  sender token balance (decimal string) for outflow ratio
 * @param {Array}  [p.knownAddresses] history/book/whitelist for the look-alike screen
 * @param {Array}  [p.priorSends]     past OUTFLOW amounts of the same asset (history baseline)
 * @param {Array}  [p.knownCounterparties] addresses the user has transacted with / saved
 * @returns {Promise<object>} preview result (see assessEvmTransaction + meta).
 */
export async function simulateEvmTransaction({
  networkKey,
  from,
  to,
  valueWei = 0n,
  data,
  nativeSymbol = 'ETH',
  tokenSymbol = null,
  tokenDecimals = 18,
  tokenBalance = null,
  knownAddresses = [],
  priorSends = [],
  knownCounterparties = [],
}) {
  // I3: this issues live read-only RPC calls (eth_estimateGas / eth_call etc). It
  // must never run inside a deniability (decoy/hidden) session — fail closed on the
  // exported function itself so a future caller can't leak egress.
  if (isDeniabilitySessionActive()) throw new Error('I3: no egress in deniability session');
  if (!isAddress(to)) throw new Error('Invalid recipient/target address');
  const provider = getProvider(networkKey); // existing RPC; throws if mainnet gated
  const queries = []; // record the read-only methods we used (for the UI disclosure)

  const hasData = !!data && data !== '0x';
  const decoded = /** @type {any} */ (hasData
    ? describeErc20Call({ data, tokenSymbol, decimals: tokenDecimals })
    : { kind: 'native' });

  // Run all independent RPC reads in parallel so total wall-clock time is
  // max(individual latencies) rather than their sum. A 5-second timeout wraps
  // every call so an unresponsive node can never hang the verify step indefinitely
  // — each timed-out call degrades gracefully to null/false (I4 fail-closed).
  const RPC_TIMEOUT_MS = 5_000;
  const withTimeout = (p) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('rpc-timeout')), RPC_TIMEOUT_MS)),
  ]);

  const isApproveWithSpender = decoded.kind === 'approve' && isAddress(decoded.spender);
  const [codeRes, balanceRes, callRes, spenderRes] = await Promise.allSettled([
    withTimeout(provider.getCode(to)),
    withTimeout(provider.getBalance(from)),
    withTimeout(provider.call({ from, to, value: toBig(valueWei), data: hasData ? data : undefined })),
    isApproveWithSpender ? withTimeout(provider.getCode(decoded.spender)) : Promise.resolve(null),
  ]);

  // eth_getCode(to) — is the recipient a contract?
  let targetIsContract = false;
  let recipientCode = null;
  if (codeRes.status === 'fulfilled' && codeRes.value != null) {
    queries.push('eth_getCode');
    recipientCode = codeRes.value;
    targetIsContract = !!codeRes.value && codeRes.value !== '0x';
  }

  // eth_getCode(spender) — for ERC-20 approve: is the spender a contract?
  let spenderIsContract = null;
  if (isApproveWithSpender && spenderRes.status === 'fulfilled' && spenderRes.value != null) {
    if (!queries.includes('eth_getCode')) queries.push('eth_getCode');
    spenderIsContract = !!spenderRes.value && spenderRes.value !== '0x';
  }

  // eth_getBalance(from) — sender native balance for large-outflow ratio.
  let nativeBalanceWei = null;
  if (balanceRes.status === 'fulfilled' && balanceRes.value != null) {
    nativeBalanceWei = balanceRes.value.toString();
    queries.push('eth_getBalance');
  }

  // eth_call dry-run — a predicted revert means signing would waste gas.
  // M-4 (I5 disclosure): this prediction is RPC-attested only. A hostile or
  // misconfigured RPC can fake either polarity — return success on a would-revert
  // tx, or inject an inflammatory revertReason on a legitimate one. The risk is
  // acceptable because Veyrnox supports self-hostable RPCs (I5 untrusted-backend
  // design), but callers must treat willRevert as advisory, not authoritative.
  //
  // The rejection is THREE-valued, not two. `provider.call()` rejects both when
  // the node ran the call and it REVERTED and when we never got an answer, and
  // those mean opposite things to someone about to sign. Collapsing them has
  // gone wrong in both directions: originally every rejection became
  // willRevert (an RPC timeout reported as a confident "will FAIL"), then the
  // fix for that routed every rejection to simulationFailed, which left
  // willRevert with no assignment anywhere — permanently false, its branch
  // below unreachable, and a genuine revert demoted from `high` to `info`.
  // `code === 'CALL_EXCEPTION'` is NOT the discriminator, though it looks like
  // one: ethers raises CALL_EXCEPTION for an unreachable RPC too, with
  // shortMessage "missing revert data" and `data: null` (verified against a
  // dead endpoint — it is what makes the network-free test in simulate.test.js
  // fail if you gate on the code alone). What separates the two is whether the
  // node ANSWERED: a real revert carries revert data (possibly bare '0x') and
  // often a decoded reason; no answer leaves `data` null.
  //
  // Ambiguity resolves toward `simulationFailed`, never toward willRevert —
  // claiming no verdict when we had one is a smaller harm than inventing a
  // verdict we never got. Pinned by simulate-revert.test.js.
  //
  // KNOWN COVERAGE GAP, accepted deliberately: some providers answer a reverting
  // eth_call with a bare `{"error":{"message":"execution reverted"}}` and no
  // `data` member. That is indistinguishable here from a node that never
  // answered, so it lands on the degraded side and the user is told the outcome
  // was not checked rather than that it will fail. Under-claiming, which is the
  // direction this file always errs in — but it does mean a predicted revert can
  // be missed on such an RPC, not merely reported late.
  let willRevert = false;
  let revertReason = null;
  let simulationFailed = false;
  const callErr = callRes.status === 'rejected' ? callRes.reason : null;
  const nodeReturnedRevert = callErr?.code === 'CALL_EXCEPTION'
    && (callErr.data != null || (typeof callErr.reason === 'string' && callErr.reason.length > 0));
  if (callRes.status === 'fulfilled') {
    queries.push('eth_call');
  } else if (nodeReturnedRevert) {
    // The dry-run COMPLETED and the transaction reverts. That is a simulation
    // result, not a simulation failure — `simulated` stays true.
    queries.push('eth_call');
    willRevert = true;
    revertReason = extractRevertReason(callRes.reason);
  } else {
    // Timed out, network error, or a node that would not answer — the dry-run
    // did not complete. I4: report no outcome rather than inventing one. Note
    // eth_call is deliberately NOT pushed to `queries`: the source disclosure
    // lists what we actually managed to read.
    //
    // `revertReason` stays NULL here. Nothing reverted, so there is no revert
    // reason to report — and the raw value would be `extractRevertReason()`'s
    // fallback to `e.message`, an ethers string that can carry the RPC endpoint
    // and internal payload detail straight into user-facing copy below
    // (CLAUDE.md A10: never surface internal error detail). The failure is
    // already fully described by `degraded` + the risk entry.
    simulationFailed = true;
  }

  const assessment = assessEvmTransaction({
    decoded,
    txTo: to,
    valueWei,
    nativeBalanceWei,
    nativeSymbol,
    networkKey,
    tokenSymbol,
    tokenBalance,
    knownAddresses,
    targetIsContract,
    spenderIsContract,
    priorSends,
    knownCounterparties,
  });

  if (simulationFailed) {
    // I4 (fail honest): eth_call did not complete; don't fake a simulation result.
    // Surface the failure so the UI can degrade gracefully (e.g. "Could not simulate").
    //
    // `medium`, not `info`. "We could not check this transaction" is a caution,
    // not a footnote: at `info` it renders in `text-muted-foreground`, the
    // dimmest treatment on the panel, for the single most important thing the
    // user could be told about a transaction they are about to sign. It is the
    // same situation the component's `error && !result` branch already styles as
    // caution. Raising it also moves it ABOVE the fold in TransactionPreview,
    // which renders actionable risks before info notes.
    //
    // No raw error text: whatever ethers said about the transport is a debugging
    // detail, not something to print to someone deciding whether to sign.
    assessment.risks.unshift({
      level: 'medium',
      code: 'simulation_unavailable',
      title: 'Transaction simulation unavailable',
      detail: 'Your RPC did not complete the dry-run, so this transaction\'s outcome was not checked. That is not a green light — verify the recipient, amount and contract yourself.',
    });
  } else if (willRevert) {
    // Lead with it — a predicted failure is the most actionable single fact.
    assessment.risks.unshift({
      level: 'high',
      code: 'will_revert',
      title: 'Transaction predicted to FAIL',
      detail: `Simulated against your RPC, this transaction reverts${revertReason ? `: ${revertReason}` : ''}. Signing it would spend gas without doing what you intended.`,
    });
  }

  return {
    chain: 'evm',
    simulated: !simulationFailed, // eth_call completed (a revert IS a completed dry-run)
    // A check we INTENDED to run did not run. Distinct from `simulated: false`,
    // which BTC and SOL return by design (decode-only, nothing to dry-run) — so
    // a consumer must not read `!simulated` as "degraded" or it would suppress
    // the no-known-risks summary on every BTC/SOL preview. Consumed by
    // TransactionPreview to keep that summary off a transaction we never checked.
    degraded: simulationFailed,
    recipientCode,    // raw eth_getCode hex of `to` (null if unfetchable) — risk S7 input
    willRevert,
    revertReason,
    decoded,
    ...assessment,
    source: {
      mode: 'local-rpc',
      queries: [...new Set(queries)],
      thirdParty: false,
    },
    coverageNote:
      'This check predicts the outcome and flags known risk patterns and deviations from your own history — ' +
      "not a guarantee of safety, and won't catch every novel threat.",
  };
}
