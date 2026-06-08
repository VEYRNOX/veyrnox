// src/risk/signals/s4-address-poisoning.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL. AUDIT-PRIORITY SIGNAL.
//
// S4 — address poisoning / lookalike. Flags a recipient that resembles a real
// counterparty from THIS wallet-set's history (I3: active-set-scoped only) but
// is not equal — the "looks like an address you used" attack. Pure string/
// address inspection; no network, no signer, no seed.
//
// Two complementary detectors:
//   - prefix/suffix lookalike (isLookAlike): same truncated head+tail, different
//     middle — the row a user eyeballs as 0xABCD…WXYZ.
//   - low Levenshtein (isNearDuplicate): a near-duplicate whose single-character
//     difference sits in the head/tail, which the prefix/suffix rule alone misses.
//
// Contract: a resembling-but-not-equal counterparty → RISK. An exact match to a
// known counterparty is NOT poisoning → OK (don't cry wolf). No reference set,
// or a non-EVM/unparseable recipient → OK (nothing to be a lookalike of).

import { LEVEL } from '../levels.js';
import { normAddr, entryAddr, isLookAlike, isNearDuplicate } from '../address.js';

// A crafted near-duplicate differs from its target in 1–4 nibbles; two unrelated
// addresses differ in ~37 of 40. A threshold of 4 cleanly separates the two
// without false-positiving on random addresses.
export const S4_LEVENSHTEIN_MAX = 4;

/**
 * @param {{ to?: string }} unsignedTx
 * @param {{ counterparties?: Array<string|{address:string}> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s4AddressPoisoning(unsignedTx, activeSetLocalState, _chainData) {
  const recipient = normAddr(unsignedTx?.to);
  const counterparties = activeSetLocalState?.counterparties || [];

  // Not applicable: non-EVM/unparseable recipient has no hex body to compare.
  if (!recipient) return { level: LEVEL.OK, evidence: { reason: 'Recipient not screened for lookalikes.' } };

  // De-duplicate the reference set by address.
  const known = new Set();
  for (const c of counterparties) {
    const addr = entryAddr(c);
    if (addr) known.add(addr);
  }

  // An exact match to a known-good counterparty is the opposite of poisoning.
  if (known.has(recipient)) {
    return { level: LEVEL.OK, evidence: { reason: 'Recipient is a known counterparty.' } };
  }

  for (const candidate of known) {
    if (isLookAlike(recipient, candidate) || isNearDuplicate(recipient, candidate, S4_LEVENSHTEIN_MAX)) {
      return {
        level: LEVEL.RISK,
        evidence: {
          reason: 'This recipient closely resembles an address you have used before — check every character.',
          values: { recipient, resembles: candidate },
        },
      };
    }
  }

  return { level: LEVEL.OK, evidence: { reason: 'Recipient does not resemble a known counterparty.' } };
}
