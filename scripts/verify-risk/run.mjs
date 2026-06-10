// scripts/verify-risk/run.mjs
//
// Risk Scoring v1 — VERIFICATION INSTRUMENT runner. NOT product code.
//
//   node scripts/verify-risk/run.mjs
//
// Runs every read-only case (cases.mjs) through the pure composite scorer and
// reports whether the scorer BEHAVED as each case expects. The scorer is a pure
// function, so this needs no signer and no network — these are the "read-only
// scoring paths".
//
// READ THIS BEFORE TRUSTING A GREEN RUN: a PASS here means "the scorer maps this
// input to the expected verdict". It is NOT verification. No signal becomes
// "verified" without the real on-chain artifact named in each case's `verifiedBy`
// (a broadcast txid / a real RPC resolution / a real historical tx). This runner
// prints that gap for every non-logic case and never writes to a verification log.

import { CASES } from './cases.mjs';
import { scoreCase, checkExpectations } from './score-tx.mjs';
import { score } from '../../src/risk/index.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const YEL = '\x1b[33m';
const RST = '\x1b[0m';

let pass = 0;
let fail = 0;
const failures = [];

console.log(`${BOLD}Risk Scoring v1 — read-only scoring paths${RST}`);
console.log(`${DIM}Scorer-behaviour checks only. A PASS is NOT on-chain verification.${RST}\n`);

for (const c of CASES) {
  const result = scoreCase(c);
  const check = checkExpectations(result, c.expect ?? {});
  const tag = check.ok ? `${GREEN}PASS${RST}` : `${RED}FAIL${RST}`;
  if (check.ok) pass++;
  else {
    fail++;
    failures.push({ id: c.id, mismatches: check.mismatches, result });
  }

  const owner = result.signalId ?? '—';
  console.log(`[${tag}] ${c.id.padEnd(28)} ${DIM}(${c.kind})${RST} composite=${result.level} owner=${owner}`);
  console.log(`        ${DIM}${c.title}${RST}`);
  if (!check.ok) {
    for (const m of check.mismatches) console.log(`        ${RED}↳ ${m}${RST}`);
  }
  // Surface the honesty boundary for everything that still needs a real artifact.
  if (c.kind !== 'logic') {
    console.log(`        ${YEL}verify:${RST} ${DIM}${c.verifiedBy}${RST}`);
  }
}

// --- I3 deniability re-confirm (read-only) --------------------------------
// Re-confirm on a representative multi-fire case that the output is structurally
// and verdict-identical under a REAL-set vs a DECOY-set state of the same shape,
// and that nothing in the output names a set / count / balance. The unit suite
// already asserts this; here it is re-run as part of the read-only sweep.
console.log(`\n${BOLD}I3 deniability re-confirm (read-only)${RST}`);

const multi = CASES.find((c) => c.id === 'composite-multi-fire');
const realState = multi.activeSetLocalState;
// A decoy set: identical SHAPE, different membership/values.
const decoyState = {
  sendHistory: ['0x7777777777777777777777777777777777777777'],
  counterparties: ['0x8888888888888888888888888888888888888888'],
  knownGoodSpenders: ['0x9999999999999999999999999999999999999999'],
  ensCache: { 'decoy.eth': '0xcccccccccccccccccccccccccccccccccccccccc' },
  dustInputs: ['decoy-utxo'],
  priorSendValuesWei: ['5', '5', '5'],
};

const rReal = score(multi.unsignedTx, realState, multi.chainData);
const rDecoy = score(multi.unsignedTx, decoyState, multi.chainData);

// Recursively collect every object KEY name in a result (not values — evidence
// strings legitimately contain domain words like "counterparty").
function collectKeys(node, acc = new Set()) {
  if (Array.isArray(node)) {
    for (const x of node) collectKeys(x, acc);
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      acc.add(k);
      collectKeys(node[k], acc);
    }
  }
  return acc;
}

// The leak we guard against is a field whose NAME reveals another set / a wallet
// count / a balance. Applied to key names only.
const leakyKey = /^(balance|holdings|walletcount|count|decoy|sets?|members?)$/i;

// The FIXED contract envelope must be identical between the two states: same
// top-level keys, same signal ids/order, each signal {id, level, evidence} with a
// reason. The optional evidence.values payload may differ — it reflects only the
// ACTIVE set's own data (e.g. an INFO chip's recipient) and is not a cross-set
// leak. Comparing the full recursive key set would wrongly flag that variation.
const envelope = (r) => JSON.stringify({
  top: Object.keys(r).sort(),
  signals: r.signals.map((s) => ({
    keys: Object.keys(s).sort(),
    hasReason: typeof s.evidence?.reason === 'string',
  })),
});
const sameShape = envelope(rReal) === envelope(rDecoy);

// The composite VERDICT must be identical (level/sentence/owner/confirm). Per-
// signal evidence may legitimately differ — each set scores its own history; the
// invariant is that the surfaced verdict and the output shape do not.
const verdictIdentical = rReal.level === rDecoy.level
  && rReal.sentence === rDecoy.sentence
  && rReal.signalId === rDecoy.signalId
  && rReal.requiresConfirmation === rDecoy.requiresConfirmation
  && rReal.signals.map((s) => s.id).join() === rDecoy.signals.map((s) => s.id).join();

// Scan ALL key names (recursively, both states) for a leaky field name.
const allKeys = new Set([...collectKeys(rReal), ...collectKeys(rDecoy)]);
const leakedKeys = [...allKeys].filter((k) => leakyKey.test(k));
const noLeak = leakedKeys.length === 0;

if (sameShape && verdictIdentical && noLeak) {
  console.log(`[${GREEN}PASS${RST}] real-set vs decoy-set: identical output shape + identical composite verdict; no key names a set/count/balance.`);
  pass++;
} else {
  console.log(`[${RED}FAIL${RST}] I3 re-confirm: sameShape=${sameShape} verdictIdentical=${verdictIdentical} noLeak=${noLeak}`);
  if (!noLeak) console.log(`        ${RED}↳ leaky key name(s): ${leakedKeys.join(', ')}${RST}`);
  fail++;
  failures.push({ id: 'I3-deniability', mismatches: [`sameShape=${sameShape}`, `verdictIdentical=${verdictIdentical}`, `noLeak=${noLeak}`] });
}

// --- Summary ---------------------------------------------------------------
console.log(`\n${BOLD}Summary${RST}`);
console.log(`  ${GREEN}${pass} passed${RST}, ${fail ? RED : ''}${fail} failed${RST}  (scorer-behaviour, ${CASES.length} cases + I3)`);

const byKind = {};
for (const c of CASES) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
console.log(`  ${DIM}by kind: ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join('  ')}${RST}`);

console.log(`\n${YEL}${BOLD}NOT VERIFIED.${RST} ${DIM}These checks prove scorer behaviour on constructed input.`);
console.log(`  ${DIM}B cases need a broadcast txid; D cases need a real RPC resolution / eth_getCode;`);
console.log(`  H cases need a real historical tx. Nothing here is logged as verified.${RST}`);

if (fail > 0) {
  console.log(`\n${RED}${failures.length} failure(s):${RST} ${failures.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
