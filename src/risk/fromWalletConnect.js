// src/risk/fromWalletConnect.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// Pure adapter: maps a WalletConnect eth_sendTransaction request to the three
// inputs score() expects — (unsignedTx, activeSetLocalState, chainData). NO
// network, NO signer, NO seed. Sibling of fromSendState.js; same totality
// contract (bad/missing input -> omitted fields so signals fail closed, never a
// throw).
//
// Corpus scope: the dApp-relevant signals (S2 unlimited approval, S7 calldata
// mismatch) read only calldata + recipientCode and need no corpus. The corpus
// args (history -> S1, knownAddresses -> S4, whitelist -> S3) are accepted and
// mapped exactly as fromSendState maps them, so a later enrichment pass can
// supply them — but the WalletConnect modal passes them empty in this build. S5
// (ENS) and S8 (native-send baseline) have no source on a dApp tx and stay inert.

/**
 * Parse a WC value field (hex string / number / bigint, in wei) to a bigint, or
 * undefined when it is absent/unparseable (S8 then fails closed rather than
 * misreading 0).
 * @param {unknown} v
 * @returns {bigint|undefined}
 */
function toWeiOrUndefined(v) {
  if (v == null || v === '') return undefined;
  try {
    return BigInt(/** @type {string | number | bigint | boolean} */ (v));
  } catch {
    return undefined;
  }
}

/**
 * @param {object} p
 * @param {object} [p.txParam]           WC reqParams[0]: { to, value, data, ... }
 * @param {number} [p.chainId]
 * @param {Array}  [p.history]           Transaction records (S1); empty in this build
 * @param {Array}  [p.knownAddresses]    interacted-with corpus (S4); empty in this build
 * @param {Array}  [p.whitelist]         known-good spenders (S3); empty in this build
 * @param {string|null|undefined} [p.recipientCode] eth_getCode(to) hex (S7); undefined => CAUTION
 * @returns {{ unsignedTx: object, activeSetLocalState: object, chainData: object }}
 */
export function buildRiskInputsFromWcRequest({
  txParam = {},
  chainId,
  history = [],
  knownAddresses = [],
  whitelist = [],
  recipientCode,
} = {}) {
  const tx = txParam || {};

  const unsignedTx = {
    to: tx.to || undefined,
    value: toWeiOrUndefined(tx.value),
    data: tx.data || '0x',
    displayedEns: null,    // dApp tx: no ENS display step (S5 N/A)
    inputs: undefined,     // EVM: no UTXO inputs (S6 N/A)
    chainId,
  };

  // sendHistory (S1): this set's prior SENDS only — same shape as fromSendState.
  const sendHistory = (history || [])
    .filter((t) => t?.type === 'send' && t?.to_address)
    .map((t) => ({ to: t.to_address }));

  const activeSetLocalState = {
    sendHistory,                          // S1
    counterparties: knownAddresses || [], // S4
    knownGoodSpenders: whitelist || [],   // S3
    ensCache: {},                         // S5 (no displayed name on a dApp tx)
    dustInputs: [],                       // S6 (EVM N/A)
    priorSendValuesWei: [],               // S8 (no native-send baseline wired here)
  };

  // chainData (S7): pass recipientCode through verbatim. undefined => S7 fails
  // closed (INDETERMINATE -> CAUTION) per I4.
  const chainData = { recipientCode };

  return { unsignedTx, activeSetLocalState, chainData };
}
