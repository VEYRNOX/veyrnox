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
import { describeErc20Call } from './calldata.js';
import { TOKENS } from './tokens.js';
import { screenRecipient, isLocallyFlagged } from './poison.js';
import { screenAddress, CATEGORY_LABELS, ofacSnapshotDisclosure } from './suspicious.js';
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

// Pull a human-ish revert reason out of an ethers error without throwing.
function extractRevertReason(e) {
  return e?.reason || e?.shortMessage || e?.info?.error?.message || e?.message || null;
}

// Large-outflow heuristic. Returns a risk object or null. Float ratio is fine for
// a heuristic — we never move funds based on it, only flag it.
/** @returns {{level:'high'|'medium'|'info', code:string, title:string, detail:string} | null} */
function largeOutflowRisk({ kind, valueWei, nativeBalanceWei, nativeSymbol, decodedAmount, tokenSymbol, tokenBalance, ratio }) {
  let frac = null;
  let symbol = null;
  if (kind === 'native') {
    const bal = toBig(nativeBalanceWei);
    if (nativeBalanceWei == null || bal <= 0n) return null;
    frac = Number(toBig(valueWei)) / Number(bal);
    symbol = nativeSymbol;
  } else if (kind === 'transfer') {
    const bal = parseFloat(tokenBalance);
    const amt = parseFloat(decodedAmount);
    if (!Number.isFinite(bal) || bal <= 0 || !Number.isFinite(amt)) return null;
    frac = amt / bal;
    symbol = tokenSymbol;
  } else {
    return null;
  }
  if (frac == null || !Number.isFinite(frac)) return null;
  if (frac >= 0.999) {
    return {
      level: 'high',
      code: 'entire_balance',
      title: 'Sends almost your entire balance',
      detail: `This moves ~${Math.round(frac * 100)}% of your ${symbol || 'balance'}. Drainers try to empty a wallet in one transaction — confirm this is intended.`,
    };
  }
  if (frac >= ratio) {
    return {
      level: 'medium',
      code: 'large_outflow',
      title: 'Unusually large outflow',
      detail: `This moves ~${Math.round(frac * 100)}% of your ${symbol || 'balance'}. Double-check the amount and recipient.`,
    };
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
  //     (suspicious.js DEFAULT_PROVIDERS) is now the LOCAL seed blocklist PLUS the
  //     bundled OFAC SDN snapshot — both on-device, no network. Covers sanctioned /
  //     scam / drainer / burn. WARNS, never blocks, never asserts "safe". Burn/null
  //     sinks are already surfaced by the known-bad check above, so we skip that
  //     category here to avoid a duplicate warning. Built so a future opt-in remote
  //     threat-intel provider can be passed in without touching this code.
  const screened = screenAddress(effectiveRecipient);
  for (const m of screened.matches) {
    if (m.category === 'burn') continue; // already flagged as known_bad_recipient
    // OFAC sanctions hits carry the snapshot vintage (internal audit EVM-#2) so the
    // warning is never shown without an indication of how stale the data is.
    const vintage = m.category === 'sanctioned' ? ofacSnapshotDisclosure() : null;
    risks.push({
      level: 'high',
      code: 'flagged_recipient',
      title: `Recipient flagged: ${CATEGORY_LABELS[m.category] || 'known bad'}`,
      detail: `${m.note ? `${m.note} ` : ''}Source: ${m.source}.${vintage ? ` ${vintage}` : ''} This is a WARNING from a local blocklist — it is not proof of wrongdoing, and an address that is NOT flagged is not proven trustworthy. Verify the recipient independently before sending.`,
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
  if (!isAddress(to)) throw new Error('Invalid recipient/target address');
  const provider = getProvider(networkKey); // existing RPC; throws if mainnet gated
  const queries = []; // record the read-only methods we used (for the UI disclosure)

  const hasData = !!data && data !== '0x';
  const decoded = hasData
    ? describeErc20Call({ data, tokenSymbol, decimals: tokenDecimals })
    : { kind: 'native' };

  // Is the tx target a contract? (eth_getCode) Capture the raw code too so
  // downstream consumers (risk S7) can reuse this already-fetched read instead of
  // issuing a second eth_getCode (I2: no new network call).
  let targetIsContract = false;
  let recipientCode = null;
  try {
    const code = await provider.getCode(to);
    queries.push('eth_getCode');
    recipientCode = code;
    targetIsContract = !!code && code !== '0x';
  } catch { /* RPC unreachable — degrade, never block */ }

  // For approve, also probe the spender (the party gaining spending power).
  let spenderIsContract = null;
  if (decoded.kind === 'approve' && isAddress(decoded.spender)) {
    try {
      const c = await provider.getCode(decoded.spender);
      if (!queries.includes('eth_getCode')) queries.push('eth_getCode');
      spenderIsContract = !!c && c !== '0x';
    } catch { /* degrade */ }
  }

  // Sender native balance (eth_getBalance) — for the large-outflow ratio.
  let nativeBalanceWei = null;
  try {
    nativeBalanceWei = (await provider.getBalance(from)).toString();
    queries.push('eth_getBalance');
  } catch { /* degrade */ }

  // DRY-RUN: eth_call executes the tx against CURRENT state and reverts if it
  // would fail. This is the real "simulation" — a predicted revert means signing
  // would waste gas / not do what the user expects.
  let willRevert = false;
  let revertReason = null;
  try {
    await provider.call({ from, to, value: toBig(valueWei), data: hasData ? data : undefined });
    queries.push('eth_call');
  } catch (e) {
    willRevert = true;
    revertReason = extractRevertReason(e);
    queries.push('eth_call');
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

  if (willRevert) {
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
    simulated: true, // a real on-chain dry-run (eth_call) ran
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
      'Simulated locally against your own RPC — nothing was sent to any third-party scoring service. ' +
      'This predicts the outcome, flags KNOWN risk patterns, and checks for deviations from your own ' +
      'on-device history; it is NOT a guarantee of safety and will not catch every novel threat. ' +
      'Review every detail before signing.',
  };
}
