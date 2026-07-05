// src/risk/signals/s7-calldata-mismatch.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// S7 — calldata / contract-code mismatch. Compares the tx's intent (carries
// calldata?) against the recipient's code-ness (has bytecode?) to catch
// mis-targeted sends. Uses the eth_getCode result the wallet already fetched
// (I2: no new network call). Pure function.
//
//   data + contract → OK      data + EOA      → CAUTION (calldata no-ops)
//   none + EOA      → OK      none + contract → CAUTION (value to contract)
//   code unknown    → INDETERMINATE (fail closed)

import { LEVEL } from '../levels.js';

const hasBytes = (hex) => typeof hex === 'string' && hex.startsWith('0x') && hex.length > 2;

/**
 * @param {{ data?: string }} unsignedTx
 * @param {object} _activeSetLocalState  unused
 * @param {{ recipientCode?: string }} chainData  eth_getCode of the recipient
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s7CalldataMismatch(unsignedTx, _activeSetLocalState, chainData) {
  const code = chainData?.recipientCode;

  // Fail closed: we cannot tell whether the recipient is a contract.
  if (typeof code !== 'string') {
    return { level: LEVEL.INDETERMINATE, evidence: { reason: "The recipient's contract code could not be checked." } };
  }

  const hasCalldata = hasBytes(unsignedTx?.data);
  const isContract = hasBytes(code);

  if (hasCalldata && !isContract) {
    return {
      level: LEVEL.CAUTION,
      evidence: { reason: 'This sends contract data to an address that is not a contract — it will do nothing.' },
    };
  }
  if (!hasCalldata && isContract) {
    return {
      level: LEVEL.CAUTION,
      evidence: { reason: 'This sends funds directly to a contract — confirm that is intended.' },
    };
  }

  return { level: LEVEL.OK, evidence: { reason: 'The recipient type matches the transaction.' } };
}
