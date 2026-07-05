// src/risk/signals/s8-value-anomaly.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// S8 — value-vs-history anomaly. A send far above this wallet-set's typical send
// magnitude is surfaced as a neutral INFO chip.
//
// HOLDINGS-DECOUPLED (I2): S8 reads ONLY prior SEND magnitudes. It never reads
// total balance, asset count, or wallet-set membership — the input state carries
// no balance field, so it cannot leak holdings via output or timing. This is
// structural, not a runtime check.
//
// Contract: value ≫ rolling median send → INFO; in line → OK; too little history
// to form a baseline → OK (honest gating — an INFO that can't baseline must NOT
// escalate); value missing/invalid → INDETERMINATE (fail closed).

import { formatEther } from 'ethers';
import { LEVEL } from '../levels.js';

export const S8_CONSTANTS = Object.freeze({
  // A send larger than MULTIPLE × the median prior send is "unusually large".
  MULTIPLE: 10,
  // Fewer than this many prior sends is too thin a baseline to judge against.
  MIN_HISTORY: 3,
});

// Coerce a value to a non-negative bigint of wei, or null if it is not a valid
// integer amount (S8 then fails closed rather than guessing).
function toWei(v) {
  try {
    if (typeof v === 'bigint') return v >= 0n ? v : null;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim());
  } catch {
    return null;
  }
  return null;
}

function medianWei(values) {
  const sorted = values.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

/**
 * @param {{ value?: bigint|number|string }} unsignedTx
 * @param {{ priorSendValuesWei?: Array<bigint> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s8ValueAnomaly(unsignedTx, activeSetLocalState, _chainData) {
  const value = toWei(unsignedTx?.value);
  if (value === null) {
    return { level: LEVEL.INDETERMINATE, evidence: { reason: 'The amount could not be read.' } };
  }

  const priors = (activeSetLocalState?.priorSendValuesWei || []).map(toWei).filter((v) => v !== null);

  // Honest gating: too thin a baseline → stay silent (OK), never escalate.
  if (priors.length < S8_CONSTANTS.MIN_HISTORY) {
    return { level: LEVEL.OK, evidence: { reason: 'Not enough history to compare this amount.' } };
  }

  const median = medianWei(priors);
  if (median <= 0n) {
    return { level: LEVEL.OK, evidence: { reason: 'No typical send amount to compare against.' } };
  }

  if (value > median * BigInt(S8_CONSTANTS.MULTIPLE)) {
    return {
      level: LEVEL.INFO,
      evidence: {
        reason: 'This amount is much larger than your usual send.',
        // Display as human-readable units, not raw wei — these are the values the
        // user verifies in the banner. The comparison math above stays in wei;
        // only the rendered strings are formatted. Assumes 18-decimal native
        // (true for every current EVM native asset; the adapter only feeds
        // native-send wei to S8).
        values: { value: formatEther(value), typical: formatEther(median) },
      },
    };
  }

  return { level: LEVEL.OK, evidence: { reason: 'Amount is in line with your usual sends.' } };
}
