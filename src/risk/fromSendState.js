// src/risk/fromSendState.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// Pure adapter: maps SendCrypto's live local state to the three inputs score()
// expects — (unsignedTx, activeSetLocalState, chainData). NO network, NO signer,
// NO seed; imports only ethers' parseEther. Total by design: bad/missing inputs
// produce omitted fields so the signals fail closed rather than throwing.
//
// All sources are the SAME local stores the existing pre-sign warnings already
// read (history / address book / whitelist). This adapter introduces no new data
// and no new fetch (I1/I2). It is where every mapping, unit-conversion and I3
// scoping decision lives — and is unit-tested as such.

import { parseEther } from 'ethers';

// Parse a decimal ETH-unit string to wei, or null if it is not a clean amount.
function toWeiOrNull(text) {
  try {
    if (text == null || String(text).trim() === '') return null;
    return parseEther(String(text));
  } catch {
    return null;
  }
}

/**
 * @param {object} p
 * @param {string} [p.to]                    resolved recipient address
 * @param {string} [p.amountText]            raw amount input (display units)
 * @param {boolean} [p.isErc20]              is this an ERC-20 send?
 * @param {string|null} [p.calldata]         ERC-20 calldata hex (transfer/approve), else null
 * @param {string|null} [p.displayedEns]     the ENS/SNS name the UI showed, else null
 * @param {string|null} [p.ensResolvedAddress] the address that name resolved to (display-time), else null
 * @param {number} [p.chainId]
 * @param {string} [p.assetCurrency]         selected asset symbol (filters prior native sends)
 * @param {Array}  [p.history]               base44 Transaction records
 * @param {Array}  [p.knownAddresses]        [{address,label,date}] interacted-with corpus
 * @param {Array}  [p.whitelist]             [{address,currency}] whitelisted addresses
 * @param {string|null|undefined} [p.recipientCode] eth_getCode hex of `to` (S7); undefined when unknown
 * @returns {{ unsignedTx: object, activeSetLocalState: object, chainData: object }}
 */
export function buildRiskInputs({
  to,
  amountText,
  isErc20 = false,
  calldata = null,
  displayedEns = null,
  ensResolvedAddress = null,
  chainId,
  assetCurrency,
  history = [],
  knownAddresses = [],
  whitelist = [],
  recipientCode,
} = {}) {
  // ERC-20 value rides in calldata, so the tx value is 0 (S8 then no-ops on tokens).
  // A native amount that won't parse yields undefined -> S8 fails closed.
  const value = isErc20 ? 0n : (toWeiOrNull(amountText) ?? undefined);

  const unsignedTx = {
    to: to || undefined,
    value,
    data: isErc20 ? (calldata || '0x') : '0x',
    displayedEns: displayedEns || null,
    inputs: undefined, // EVM: no UTXO inputs (S6 N/A)
    chainId,
  };

  // sendHistory (S1): this set's prior SENDS only.
  const sendHistory = (history || [])
    .filter((t) => t?.type === 'send' && t?.to_address)
    .map((t) => ({ to: t.to_address }));

  // priorSendValuesWei (S8): native-send magnitudes for the SELECTED asset only.
  // ERC-20 sends carry value in calldata (tx value 0), so S8 is native-only here.
  const priorSendValuesWei = isErc20
    ? []
    : (history || [])
        .filter((t) => t?.type === 'send' && t?.currency === assetCurrency)
        .map((t) => toWeiOrNull(t?.amount))
        .filter((v) => v !== null);

  // ensCache (S5): ONLY the name the UI already resolved at display time. No new
  // resolution here (I2). Absent name -> empty cache -> S5 not-applicable.
  const ensCache = (displayedEns && ensResolvedAddress)
    ? { [displayedEns]: ensResolvedAddress }
    : {};

  const activeSetLocalState = {
    sendHistory,                          // S1
    counterparties: knownAddresses || [], // S4 (entryAddr reads .address)
    knownGoodSpenders: whitelist || [],   // S3 (entryAddr reads .address)
    ensCache,                             // S5
    dustInputs: [],                       // S6 (EVM N/A)
    priorSendValuesWei,                   // S8
  };

  // chainData (S7): pass recipientCode through verbatim. undefined => S7 fails
  // closed (INDETERMINATE -> CAUTION) per I4.
  //
  // NOTE on ERC-20: recipientCode is eth_getCode of the ACTUAL signed tx target.
  // For a token send that target is the token CONTRACT (not `to`, the logical
  // token recipient), so S7 correctly sees calldata + contract -> OK. We do NOT
  // fetch the token recipient's own code here — that would be a second network
  // call (I2 forbids it), and S7's question is about the tx target's code, which
  // for ERC-20 is the contract. `to` above remains the logical recipient so the
  // recipient-screening signals (S1 fresh, S4 poisoning, S5 ENS) judge the right
  // address; only S7 reads recipientCode.
  const chainData = { recipientCode };

  return { unsignedTx, activeSetLocalState, chainData };
}
