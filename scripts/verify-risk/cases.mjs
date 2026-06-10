// scripts/verify-risk/cases.mjs
//
// Risk Scoring v1 — VERIFICATION INSTRUMENT cases. NOT product code.
//
// The read-only scoring cases. Every case here can be run NOW through the pure
// scorer (run.mjs) — that is all "read-only scoring paths" means: the composite is
// a pure function, so exercising it needs no signer and no network.
//
// What running a case proves vs. what it does NOT (the honesty boundary):
//   - PROVES: the scorer maps THIS input to the expected verdict (wiring + logic).
//   - DOES NOT prove: the signal fires on a REAL on-chain pattern. Each case below
//     carries a `verifiedBy` describing the real artifact still required before it
//     counts toward the verified-count in docs/risk-verification-plan-sepolia.md.
//     Until that artifact exists, the case is verification-PARKED.
//
// Case kinds mirror the plan:
//   B = needs a real broadcast txid (explorer link) to become verified.
//   D = needs a real on-chain data source (ENS resolution / eth_getCode) captured
//       in the input; here it is a FIXTURE standing in for that real data.
//   H = needs a real historical on-chain tx exhibiting the pattern.
//   logic = a pure behaviour/fail-closed control; no on-chain artifact applies.

import { Interface, MaxUint256 } from 'ethers';

const erc20 = new Interface(['function approve(address spender, uint256 value)']);
const approve = (spender, value) => erc20.encodeFunctionData('approve', [spender, value]);

// --- Fixture addresses (valid EVM addresses; lowercase so isAddress accepts) ---
const VICTIM = '0x1111111111111111111111111111111111111111';
const ATTACKER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const FRESH_RECIPIENT = '0x4444444444444444444444444444444444444444';
const KNOWN_SPENDER = '0x5555555555555555555555555555555555555555';
const FRESH_SPENDER = '0x6666666666666666666666666666666666666666';
const ENS_X = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // what the name really resolves to
const ENS_Y = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; // a different recipient

// A real counterparty and a crafted lookalike: same first 4 + last 4 nibbles,
// different middle — exactly what isLookAlike targets.
const cp = (mid) => '0xabcd' + mid.repeat(32) + 'ef12';
const KNOWN_CP = cp('1');
const LOOKALIKE = cp('2');
const UNRELATED = '0x9999888877776666555544443333222211110000';

// eth_getCode results: bytecode ⇒ contract, '0x' ⇒ EOA.
const CONTRACT_CODE = '0x60806040';
const EOA_CODE = '0x';

// A finite (bounded) approval below the unlimited threshold.
const FINITE = 100n * 10n ** 18n;

// Build calldata once so S2/S3 cases decode identically to the product path.
const APPROVE_UNLIMITED = approve(FRESH_SPENDER, MaxUint256);
const APPROVE_UNLIMITED_KNOWN = approve(KNOWN_SPENDER, MaxUint256);
const APPROVE_FINITE_FRESH = approve(FRESH_SPENDER, FINITE);
const APPROVE_FINITE_KNOWN = approve(KNOWN_SPENDER, FINITE);

// A clean baseline so OFF-target signals stay quiet and the composite owner is the
// signal under test. Overridden per case.
const quietState = () => ({
  sendHistory: [TOKEN, ATTACKER],
  counterparties: [TOKEN, ATTACKER, KNOWN_CP],
  knownGoodSpenders: [KNOWN_SPENDER],
  ensCache: {},
  dustInputs: [],
  priorSendValuesWei: [],
});

export const CASES = [
  // ===================== Tier 1 — audit-priority =========================

  // ---- S2 unlimited approval (B) ----
  {
    id: 'S2-unlimited',
    signal: 'S2',
    kind: 'B',
    title: 'unlimited approve() to a known spender ⇒ S2 owns RISK',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_UNLIMITED_KNOWN, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { composite: 'RISK', owner: 'S2', signal: { id: 'S2', level: 'RISK' } },
    verifiedBy: 'broadcast approve(spender, 2^256-1) on a Sepolia ERC-20; feed the confirmed tx calldata. (PARKED: needs txid)',
  },
  {
    id: 'S2-finite-negative',
    signal: 'S2',
    kind: 'B',
    title: 'finite approve() ⇒ S2 does NOT fire RISK',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_FINITE_KNOWN, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { signal: { id: 'S2', level: 'OK' } },
    verifiedBy: 'broadcast approve(spender, 100e18) negative control. (PARKED: needs txid)',
  },
  {
    id: 'S2-malformed-failclosed',
    signal: 'S2',
    kind: 'logic',
    title: 'approve selector with truncated args ⇒ INDETERMINATE (fail closed)',
    // approve selector but calldata too short to decode.
    unsignedTx: { to: TOKEN, value: 0, data: '0x095ea7b3deadbeef', chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { signal: { id: 'S2', level: 'INDETERMINATE' } },
    verifiedBy: 'pure fail-closed control — no on-chain artifact required.',
  },

  // ---- S4 address poisoning (B + real history) ----
  {
    id: 'S4-lookalike',
    signal: 'S4',
    kind: 'B',
    title: 'send to a lookalike of a known counterparty ⇒ S4 owns RISK',
    unsignedTx: { to: LOOKALIKE, value: 0, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), counterparties: [KNOWN_CP] },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'RISK', owner: 'S4', signal: { id: 'S4', level: 'RISK' } },
    verifiedBy: 'seed real history to KNOWN_CP on Sepolia, then score a send to a real vanity lookalike. (PARKED: needs txid + real lookalike)',
  },
  {
    id: 'S4-exact-negative',
    signal: 'S4',
    kind: 'logic',
    title: 'send to the exact known counterparty ⇒ S4 does NOT fire (not poisoning)',
    unsignedTx: { to: KNOWN_CP, value: 0, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), counterparties: [KNOWN_CP] },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S4', level: 'OK' } },
    verifiedBy: 'pure negative control — no on-chain artifact required.',
  },
  {
    id: 'S4-unrelated-boundary',
    signal: 'S4',
    kind: 'logic',
    title: 'send to an unrelated address (no prefix/suffix/edit match) ⇒ no fire',
    unsignedTx: { to: UNRELATED, value: 0, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), counterparties: [KNOWN_CP] },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S4', level: 'OK' } },
    verifiedBy: 'pure boundary control — no on-chain artifact required.',
  },

  // ---- S5 ENS mismatch (D) — realness enters via ensCache, NOT on-chain ----
  // The scorer reads activeSetLocalState.ensCache only (see corrected plan). Here
  // the cache is a FIXTURE; true (D) verification replaces it with a real Sepolia
  // RPC resolution captured into ensCache (see chain-read.mjs).
  {
    id: 'S5-mismatch',
    signal: 'S5',
    kind: 'D',
    title: 'displayed ENS resolves (in cache) to X but recipient is Y ⇒ S5 owns RISK',
    unsignedTx: { to: ENS_Y, value: 0, displayedEns: 'verified.eth', chainId: 11155111 },
    activeSetLocalState: { ...quietState(), ensCache: { 'verified.eth': ENS_X } },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'RISK', owner: 'S5', signal: { id: 'S5', level: 'RISK' } },
    verifiedBy: 'resolve a real Sepolia ENS name via RPC into ensCache, then score a recipient ≠ resolved. (PARKED: needs real RPC resolution — chain-read.mjs)',
  },
  {
    id: 'S5-match-negative',
    signal: 'S5',
    kind: 'D',
    title: 'recipient == cached resolved address ⇒ S5 does NOT fire',
    unsignedTx: { to: ENS_X, value: 0, displayedEns: 'verified.eth', chainId: 11155111 },
    activeSetLocalState: { ...quietState(), ensCache: { 'verified.eth': ENS_X } },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S5', level: 'OK' } },
    verifiedBy: 'negative control against the same real RPC resolution. (PARKED: needs real RPC resolution)',
  },
  {
    id: 'S5-absent-failclosed',
    signal: 'S5',
    kind: 'logic',
    title: 'displayed ENS absent from cache ⇒ INDETERMINATE (fail closed, no on-chain retry)',
    unsignedTx: { to: ENS_Y, value: 0, displayedEns: 'unresolved.eth', chainId: 11155111 },
    activeSetLocalState: { ...quietState(), ensCache: { 'verified.eth': ENS_X } },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S5', level: 'INDETERMINATE' } },
    verifiedBy: 'pure fail-closed control — no on-chain artifact required.',
  },

  // ============================ Tier 2 ===================================

  // ---- S3 fresh-spender approval (B) ----
  {
    id: 'S3-fresh-spender',
    signal: 'S3',
    kind: 'B',
    title: 'finite approve() to a spender NOT in known-good ⇒ S3 owns RISK',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_FINITE_FRESH, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { composite: 'RISK', owner: 'S3', signal: { id: 'S3', level: 'RISK' } },
    verifiedBy: 'broadcast approve() to a spender outside known-good. (PARKED: needs txid)',
  },
  {
    id: 'S3-known-negative',
    signal: 'S3',
    kind: 'logic',
    title: 'approve() to a known-good spender ⇒ S3 does NOT fire',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_FINITE_KNOWN, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { signal: { id: 'S3', level: 'OK' } },
    verifiedBy: 'pure negative control — no on-chain artifact required.',
  },

  // ---- S1 fresh recipient (B / real history) ----
  {
    id: 'S1-fresh',
    signal: 'S1',
    kind: 'B',
    title: 'send to a never-seen recipient ⇒ S1 INFO',
    unsignedTx: { to: FRESH_RECIPIENT, value: 0, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), sendHistory: [ATTACKER], counterparties: [ATTACKER] },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'INFO', owner: 'S1', signal: { id: 'S1', level: 'INFO' } },
    verifiedBy: 'build a send to a brand-new Sepolia address with real prior history. (PARKED: needs txid/history)',
  },
  {
    id: 'S1-seen-negative',
    signal: 'S1',
    kind: 'logic',
    title: 'send to an address already in history ⇒ S1 does NOT fire',
    unsignedTx: { to: ATTACKER, value: 0, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), sendHistory: [ATTACKER], counterparties: [ATTACKER] },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S1', level: 'OK' } },
    verifiedBy: 'pure negative control — no on-chain artifact required.',
  },

  // ---- S6 dust input (H) — BTC-style inputs ----
  {
    id: 'S6-dust',
    signal: 'S6',
    kind: 'H',
    title: 'tx spends a dust-tagged input ⇒ S6 CAUTION',
    unsignedTx: { to: FRESH_RECIPIENT, value: 0, inputs: ['utxo-dust-1', 'utxo-clean-2'], chainId: 11155111 },
    activeSetLocalState: { ...quietState(), dustInputs: ['utxo-dust-1'] },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'CAUTION', owner: 'S6', signal: { id: 'S6', level: 'CAUTION' } },
    verifiedBy: 'find a real dust transfer on-chain, tag it, score a tx that spends it. (PARKED: needs real historical dust tx)',
  },
  {
    id: 'S6-clean-negative',
    signal: 'S6',
    kind: 'logic',
    title: 'tx spends only clean inputs ⇒ S6 does NOT fire',
    unsignedTx: { to: FRESH_RECIPIENT, value: 0, inputs: ['utxo-clean-2'], chainId: 11155111 },
    activeSetLocalState: { ...quietState(), dustInputs: ['utxo-dust-1'] },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S6', level: 'OK' } },
    verifiedBy: 'pure negative control — no on-chain artifact required.',
  },
  {
    id: 'S6-unreadable-failclosed',
    signal: 'S6',
    kind: 'logic',
    title: 'inputs present but not an array ⇒ INDETERMINATE (fail closed)',
    unsignedTx: { to: FRESH_RECIPIENT, value: 0, inputs: 'not-an-array', chainId: 11155111 },
    activeSetLocalState: { ...quietState(), dustInputs: ['utxo-dust-1'] },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S6', level: 'INDETERMINATE' } },
    verifiedBy: 'pure fail-closed control — no on-chain artifact required.',
  },

  // ---- S7 calldata / code mismatch (D) ----
  {
    id: 'S7-data-to-eoa',
    signal: 'S7',
    kind: 'D',
    title: 'calldata sent to an EOA (no code) ⇒ S7 CAUTION',
    unsignedTx: { to: KNOWN_CP, value: 0, data: APPROVE_FINITE_KNOWN, chainId: 11155111 },
    // KNOWN_CP is a known counterparty (S4 OK) and in history (S1 OK); EOA code → mismatch.
    activeSetLocalState: { ...quietState(), sendHistory: [KNOWN_CP], counterparties: [KNOWN_CP], knownGoodSpenders: [KNOWN_SPENDER] },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'CAUTION', owner: 'S7', signal: { id: 'S7', level: 'CAUTION' } },
    verifiedBy: 'eth_getCode of a real Sepolia EOA = 0x; score a calldata-bearing tx to it. (PARKED: needs real eth_getCode — chain-read.mjs)',
  },
  {
    id: 'S7-data-to-contract-negative',
    signal: 'S7',
    kind: 'D',
    title: 'calldata sent to a contract (has code) ⇒ S7 does NOT fire',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_FINITE_KNOWN, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { signal: { id: 'S7', level: 'OK' } },
    verifiedBy: 'eth_getCode of the real Sepolia test ERC-20 = bytecode. (PARKED: needs real eth_getCode)',
  },
  {
    id: 'S7-value-to-contract',
    signal: 'S7',
    kind: 'D',
    title: 'value-only send to a contract (has code, no calldata) ⇒ S7 CAUTION',
    unsignedTx: { to: TOKEN, value: 1, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), sendHistory: [TOKEN], counterparties: [TOKEN] },
    chainData: { recipientCode: CONTRACT_CODE },
    expect: { composite: 'CAUTION', owner: 'S7', signal: { id: 'S7', level: 'CAUTION' } },
    verifiedBy: 'PRODUCT DECISION FIRST (does the user model ever do this?), then eth_getCode of a real contract. (PARKED)',
  },
  {
    id: 'S7-unknown-failclosed',
    signal: 'S7',
    kind: 'logic',
    title: 'recipient code not fetched ⇒ INDETERMINATE (fail closed)',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_FINITE_KNOWN, chainId: 11155111 },
    activeSetLocalState: quietState(),
    chainData: {}, // recipientCode missing
    expect: { signal: { id: 'S7', level: 'INDETERMINATE' } },
    verifiedBy: 'pure fail-closed control — no on-chain artifact required.',
  },

  // ---- S8a value-vs-history anomaly (B / real history) — HARNESS-VERIFIABLE ----
  {
    id: 'S8a-anomaly',
    signal: 'S8',
    kind: 'B',
    title: 'send ≫ 10× median prior send ⇒ S8 INFO',
    unsignedTx: { to: ATTACKER, value: '1000000000000000000', chainId: 11155111 }, // 1 ETH
    activeSetLocalState: {
      ...quietState(),
      sendHistory: [ATTACKER],
      counterparties: [ATTACKER],
      // three ~0.001 ETH priors ⇒ median 1e15; 1e18 is 1000× ⇒ anomaly.
      priorSendValuesWei: ['1000000000000000', '1000000000000000', '1000000000000000'],
    },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'INFO', owner: 'S8', signal: { id: 'S8', level: 'INFO' } },
    verifiedBy: 'seed real small sends, then broadcast/score a 10×+ larger one. (PARKED: needs txid/history)',
  },
  {
    id: 'S8a-inline-negative',
    signal: 'S8',
    kind: 'logic',
    title: 'send in line with median ⇒ S8 does NOT fire',
    unsignedTx: { to: ATTACKER, value: '1000000000000000', chainId: 11155111 },
    activeSetLocalState: {
      ...quietState(),
      sendHistory: [ATTACKER],
      counterparties: [ATTACKER],
      priorSendValuesWei: ['1000000000000000', '1000000000000000', '1000000000000000'],
    },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S8', level: 'OK' } },
    verifiedBy: 'pure negative control — no on-chain artifact required.',
  },
  {
    id: 'S8a-thin-history',
    signal: 'S8',
    kind: 'logic',
    title: 'fewer than MIN_HISTORY priors ⇒ OK (honest gating, no escalation)',
    unsignedTx: { to: ATTACKER, value: '1000000000000000000', chainId: 11155111 },
    activeSetLocalState: {
      ...quietState(),
      sendHistory: [ATTACKER],
      counterparties: [ATTACKER],
      priorSendValuesWei: ['1000000000000000', '1000000000000000'], // only 2
    },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S8', level: 'OK' } },
    verifiedBy: 'pure honest-gating control — no on-chain artifact required.',
  },
  {
    id: 'S8a-unparseable-failclosed',
    signal: 'S8',
    kind: 'logic',
    title: 'unparseable value ⇒ INDETERMINATE (fail closed)',
    unsignedTx: { to: ATTACKER, value: 'not-a-number', chainId: 11155111 },
    activeSetLocalState: {
      ...quietState(),
      sendHistory: [ATTACKER],
      counterparties: [ATTACKER],
      priorSendValuesWei: ['1000000000000000', '1000000000000000', '1000000000000000'],
    },
    chainData: { recipientCode: EOA_CODE },
    expect: { signal: { id: 'S8', level: 'INDETERMINATE' } },
    verifiedBy: 'pure fail-closed control — no on-chain artifact required.',
  },

  // ===================== Composite + deniability =========================
  {
    id: 'composite-multi-fire',
    signal: 'composite',
    kind: 'B',
    title: 'unlimited approve to a FRESH spender ⇒ S2+S3 both RISK; S2 owns the one sentence',
    unsignedTx: { to: TOKEN, value: 0, data: APPROVE_UNLIMITED, chainId: 11155111 },
    activeSetLocalState: quietState(), // FRESH_SPENDER is not in knownGoodSpenders
    chainData: { recipientCode: CONTRACT_CODE },
    expect: {
      composite: 'RISK',
      owner: 'S2', // registry tie-break: S2 before S3
      signal: { id: 'S3', level: 'RISK' },
    },
    verifiedBy: 'broadcast the compound pattern; confirm one-sentence composite on real calldata. (PARKED: needs txid)',
  },
  {
    id: 'all-quiet-OK',
    signal: 'composite',
    kind: 'logic',
    title: 'a plain value send to a known recipient ⇒ composite OK, no sentence',
    unsignedTx: { to: ATTACKER, value: 1, chainId: 11155111 },
    activeSetLocalState: { ...quietState(), sendHistory: [ATTACKER], counterparties: [ATTACKER] },
    chainData: { recipientCode: EOA_CODE },
    expect: { composite: 'OK', owner: null },
    verifiedBy: 'pure baseline control — no on-chain artifact required.',
  },
];
