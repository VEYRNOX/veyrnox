// src/risk/signals/s1-fresh-recipient.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// S1 — fresh recipient. A recipient this wallet-set has never sent to before is
// surfaced as a neutral INFO chip. Active-set-scoped (I3): history is the active
// set's own prior sends only — never read across sets. Pure function; chain-
// agnostic (EVM addresses compare case-insensitively, others exact).
//
// Contract: recipient ∉ history → INFO; recipient ∈ history → OK; no recipient to
// evaluate → INDETERMINATE (fail closed).

import { LEVEL } from '../levels.js';
import { recipientKey } from '../address.js';

/**
 * @param {{ to?: string }} unsignedTx
 * @param {{ sendHistory?: Array<string|{to:string}> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s1FreshRecipient(unsignedTx, activeSetLocalState, _chainData) {
  const target = recipientKey(unsignedTx?.to);
  if (!target) {
    return { level: LEVEL.INDETERMINATE, evidence: { reason: 'No recipient to check against history.' } };
  }

  const seen = new Set();
  for (const h of activeSetLocalState?.sendHistory || []) {
    const key = recipientKey(typeof h === 'string' ? h : h?.to);
    if (key) seen.add(key);
  }

  if (seen.has(target)) {
    return { level: LEVEL.OK, evidence: { reason: 'You have sent to this recipient before.' } };
  }

  return {
    level: LEVEL.INFO,
    evidence: { reason: 'First time sending to this recipient.', values: { recipient: unsignedTx.to } },
  };
}
