// wallet-core/evm/suspicious.js
//
// Suspicious-recipient screening against a blocklist (Phase S2 — transaction
// safety). LOCAL-ONLY by default: the one shipped provider is a structured,
// on-device blocklist, so screening leaks no user intent off-device.
//
// THE PROBLEM
//   Some recipient addresses are known-bad before you ever send to them: burn /
//   null sinks (funds gone forever), addresses sanctioned by a public authority,
//   and addresses publicly documented as scam or wallet-drainer infrastructure.
//   Sending to one is almost always a mistake or the tail end of a scam.
//
// THE DEFENCE (this module)
//   Given a recipient, screen it against one or more PLUGGABLE providers and
//   return a structured { valid, flagged, matches, reasons }. The send flow
//   surfaces a match as a WARNING before signing. It never blocks, and — like
//   poison.js / spam.js / simulate.js — it NEVER claims an address is "safe". A
//   recipient that no provider flags is simply "not flagged", not "proven safe".
//
// SECURITY / SCOPE RATIONALE
//   - NO keys, NO signing, NO network. The default provider is a local blocklist;
//     pure string/address inspection. Lives under the guarded wallet-core path so
//     the RNG tripwire covers it too.
//   - Local-first by design (privacy): the shipped provider calls nothing. The
//     provider interface is deliberately small so a future, OFF-BY-DEFAULT remote
//     threat-intel provider can slot in as an explicit, disclosed user choice —
//     WITHOUT rearchitecting this module. This module itself never makes a call.
//   - Heuristic / incomplete, never absolute: returns REASONS and the UI frames
//     them as "flagged", not a guarantee. See NOT-EXHAUSTIVE note on the seed list.
//
// Address normalisation mirrors poison.js (ethers isAddress -> lowercase 0x).

import { isAddress } from 'ethers';
import { LOCAL_FLAGGED } from './poison.js';

// Normalise to a lowercase 0x address, or null if it is not a valid EVM address.
// Non-EVM recipients (BTC/SOL) return null and are simply not screened here.
// (Same approach as poison.js's norm — kept identical on purpose.)
function norm(a) {
  if (typeof a !== 'string' || !isAddress(a)) return null;
  return a.toLowerCase();
}

// The categories a blocklist entry may carry. Kept small and explicit; a provider
// may only use these. Each maps to a human label used when building reasons.
export const CATEGORIES = ['scam', 'drainer', 'sanctioned', 'burn'];
export const CATEGORY_LABELS = {
  scam: 'known scam address',
  drainer: 'known wallet-drainer address',
  sanctioned: 'sanctioned address',
  burn: 'burn / null sink',
};

// ---------------------------------------------------------------------------
// DEFAULT BLOCKLIST
//
// NOT EXHAUSTIVE. This is a small, illustrative, on-device seed — it is NOT a
// substitute for a maintained threat feed, and an address that is NOT on this
// list is NOT proven safe. It exists to catch the obvious, well-documented cases
// locally (no network), and to demonstrate the entry shape a richer list / a
// future remote provider would use. Every entry carries a real, checkable source.
//
// Each entry: { address, category (one of CATEGORIES), source, note }.
// ---------------------------------------------------------------------------
export const DEFAULT_BLOCKLIST = [
  // Burn / null sinks — reused from poison.js's LOCAL_FLAGGED so the two modules
  // stay in agreement about the universal "funds gone forever" addresses.
  ...[...LOCAL_FLAGGED].map((address) => ({
    address,
    category: 'burn',
    source: 'poison.js LOCAL_FLAGGED (universal burn/null sinks)',
    note: 'Funds sent here are destroyed and unrecoverable.',
  })),

  // Publicly documented, sanctioned addresses (well-known, citable). Sanctioned
  // status is a matter of public record; this is informational and not legal
  // advice. These are illustrative, not a complete OFAC mirror.
  //
  // MUST TRACK DELISTINGS, NOT JUST ADDITIONS. A "sanctioned" label is a factual
  // claim about current legal status, so it has to be removed when the authority
  // delists an address — otherwise a stale flag becomes a false accusation. (E.g.
  // Tornado Cash was removed here after OFAC delisted it on 2025-03-21 following
  // Van Loon v. Treasury, 5th Cir.; keeping its 'sanctioned' entry would have been
  // factually wrong.)
  {
    address: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96',
    category: 'sanctioned',
    source: 'US Treasury OFAC SDN list (Apr 2022) — Lazarus Group / Ronin Bridge exploiter',
    note: 'OFAC-designated address tied to the $600M Ronin Bridge theft.',
  },
];

/**
 * Build a blocklist-backed provider. A provider is the small interface the
 * screen consumes: `{ name, screen(normAddr) }`, where `screen` takes an ALREADY
 * NORMALISED lowercase address and returns the array of matching entries (each
 * `{ address, category, source, note }`), or [] for no match.
 *
 * Exposed as a factory so callers (and future providers) can supply their own
 * structured list without re-implementing the lookup.
 *
 * @param {{address:string, category:string, source?:string, note?:string}[]} blocklist
 * @param {string} [name]
 * @returns {{ name: string, screen: (normAddr: string) => object[] }}
 */
export function makeBlocklistProvider(blocklist = DEFAULT_BLOCKLIST, name = 'local-blocklist') {
  // Index by normalised address; an address may carry multiple entries.
  const byAddress = new Map();
  for (const e of blocklist) {
    const address = norm(e?.address);
    if (!address) continue;
    const entry = { ...e, address };
    const list = byAddress.get(address);
    if (list) list.push(entry);
    else byAddress.set(address, [entry]);
  }
  return {
    name,
    screen(normAddr) {
      return byAddress.get(normAddr) || [];
    },
  };
}

// The ONE default provider: the local, on-device blocklist above. Calls nothing.
export const localBlocklistProvider = makeBlocklistProvider();

// Turn a normalised match into a human-readable reason string.
function reasonFor(m) {
  const label = CATEGORY_LABELS[m.category] || 'known-bad address';
  const note = m.note ? ` ${m.note}` : '';
  return `Recipient is a ${label}.${note} Source: ${m.source}.`;
}

/**
 * Screen a recipient against one or more providers. LOCAL by default (the shipped
 * provider makes no network call). Reports flagged / not-flagged ONLY — it never
 * asserts an address is "safe".
 *
 * @param {string} address                          the recipient to screen
 * @param {{ providers?: Array<{name:string, screen:Function}> }} [opts]
 * @returns {{
 *   valid: boolean,    // recipient is a parseable EVM address
 *   flagged: boolean,  // at least one provider matched it
 *   matches: Array<{ address, category, source, note, provider }>,
 *   reasons: string[]  // human-readable, one per match
 * }}
 */
export function screenAddress(address, { providers = [localBlocklistProvider] } = {}) {
  const target = norm(address);
  if (!target) {
    // Non-EVM or malformed: not screenable here. Explicitly NOT "safe".
    return { valid: false, flagged: false, matches: [], reasons: [] };
  }

  const matches = [];
  const seen = new Set(); // de-dupe across providers by address+category
  for (const provider of providers) {
    if (!provider || typeof provider.screen !== 'function') continue;
    let hits;
    try {
      hits = provider.screen(target) || [];
    } catch {
      // A misbehaving provider must never break screening — degrade, never block.
      hits = [];
    }
    for (const hit of hits) {
      const addr = norm(hit?.address) || target;
      const category = hit?.category;
      const key = `${addr}|${category}`;
      if (seen.has(key)) continue; // same finding from another provider — dedup
      seen.add(key);
      matches.push({
        address: addr,
        category,
        source: hit?.source || provider.name,
        note: hit?.note || '',
        provider: provider.name,
      });
    }
  }

  const reasons = matches.map(reasonFor);
  return { valid: true, flagged: matches.length > 0, matches, reasons };
}
