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

  // Normalise the reference set to { addr, label } entries, de-duplicated by
  // address. The label (e.g. "an address you've paid before", a saved-contact
  // name) is kept so the verdict can name WHICH counterparty the recipient
  // resembles — the contextual cue ("this looks like Alice") that makes
  // poisoning recognizable. Bare-string counterparties carry no label.
  const entries = [];
  const seen = new Set();
  for (const c of counterparties) {
    const addr = entryAddr(c);
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    entries.push({ addr, label: c && typeof c === 'object' ? c.label || null : null });
  }

  // An exact match to a known-good counterparty is the opposite of poisoning.
  if (seen.has(recipient)) {
    return { level: LEVEL.OK, evidence: { reason: 'Recipient is a known counterparty.' } };
  }

  for (const { addr, label } of entries) {
    if (isLookAlike(recipient, addr) || isNearDuplicate(recipient, addr, S4_LEVENSHTEIN_MAX)) {
      const ref = label ? `“${label}”` : 'an address you have used before';
      return {
        level: LEVEL.RISK,
        evidence: {
          reason: `This recipient closely resembles ${ref} — check every character against the full address below.`,
          values: { recipient, resembles: addr },
        },
      };
    }
  }

  return { level: LEVEL.OK, evidence: { reason: 'Recipient does not resemble a known counterparty.' } };
}
