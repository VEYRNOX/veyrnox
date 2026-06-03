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
// Bundled, dated OFAC SDN snapshot (LOCAL — never fetched at runtime). Rebuilt
// only when a maintainer runs scripts/refresh-ofac-blocklist.mjs. See
// ofacSanctionsProvider below. Vite/Vitest resolve this JSON import to the parsed
// object; the file is data-only, so the RNG tripwire (which scans code, not JSON)
// is unaffected.
import ofacSnapshot from '../data/ofac-sanctioned.json';

// Normalise to a lowercase 0x address, or null if it is not a valid EVM address.
// A null return marks the input as non-EVM (so `valid` stays false); screenAddress
// then routes it by address family rather than dropping it (e.g. a raw BTC string
// is still screened against BTC-capable providers).
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
 * Declares `families: ['evm']` — it indexes by the lowercase 0x form, so it is only
 * ever consulted for EVM-family input (see screenAddress's family routing).
 *
 * @param {{address:string, category:string, source?:string, note?:string}[]} blocklist
 * @param {string} [name]
 * @returns {{ name: string, families: string[], screen: (normAddr: string) => object[] }}
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
    families: ['evm'], // EVM-only: keyed by lowercase 0x address
    screen(normAddr) {
      return byAddress.get(normAddr) || [];
    },
  };
}

// The local, on-device seed blocklist above. Calls nothing.
export const localBlocklistProvider = makeBlocklistProvider();

// ---------------------------------------------------------------------------
// OFAC SANCTIONS PROVIDER
//
// A second LOCAL provider backed by the bundled OFAC SDN snapshot
// (data/ofac-sanctioned.json). Like every provider here it makes NO network call
// at runtime — the snapshot is a dated file, rebuilt out-of-band by
// scripts/refresh-ofac-blocklist.mjs. It conforms to the EXACT provider contract
// makeBlocklistProvider produces — { name, screen(normAddr) } returning an array
// of { address, category:'sanctioned', source, note } — so it composes through
// screenAddress unchanged.
//
// TWO ADDRESS FAMILIES, TWO MATCH RULES (declared via `families: ['evm','btc']`):
//   - EVM (ETH/USDC/USDT/ARB/BSC): keyed by the lowercase 0x form (norm()). For an
//     EVM recipient screenAddress hands screen() the ALREADY normalised address, so
//     an EVM lookup is a direct Map hit.
//   - BTC (XBT): base58/bech32 strings have no checksum-lowercasing — norm() returns
//     null for them. screenAddress now routes such a raw string here BY FAMILY (this
//     provider declares it handles 'btc'), passing the recipient VERBATIM. They are
//     matched case-sensitively: a single changed character is a miss — these are
//     exact-string sanctions hits, not fuzzy matches. (Because norm() fails on BTC,
//     the recipient's `valid` stays false, but it can still be flagged here.)
// ---------------------------------------------------------------------------

// Re-exported provenance for UI disclosure / tests: source, attribution (MIT /
// 0xB10C), license, snapshotDate, counts, and the honesty notes.
export const OFAC_SNAPSHOT_META = ofacSnapshot?._meta || null;

// Build the EVM (normalised) and BTC (raw) lookup maps from the snapshot once.
function buildOfacIndex(snapshot) {
  const evm = new Map(); // lowercase 0x -> entry
  const btc = new Map(); // raw case-sensitive base58/bech32 -> entry
  for (const e of snapshot?.entries || []) {
    const entry = {
      category: e?.category || 'sanctioned',
      source: e?.source || OFAC_SNAPSHOT_META?.sourceName || 'OFAC SDN',
      note: e?.note || 'OFAC SDN-listed digital-currency address',
    };
    if (e?.kind === 'evm') {
      const a = norm(e.address);
      if (a) evm.set(a, { ...entry, address: a });
    } else if (e?.kind === 'btc') {
      if (typeof e.address === 'string' && e.address) {
        btc.set(e.address, { ...entry, address: e.address });
      }
    }
  }
  return { evm, btc };
}

const OFAC_INDEX = buildOfacIndex(ofacSnapshot);

export const ofacSanctionsProvider = {
  name: 'ofac-sdn-snapshot',
  families: ['evm', 'btc'], // handles both EVM (normalised) and BTC (raw) lookups
  screen(addr) {
    if (typeof addr !== 'string') return [];
    // EVM: screenAddress hands us an already-lowercased 0x address — direct hit.
    const evmHit = OFAC_INDEX.evm.get(addr);
    if (evmHit) return [evmHit];
    // BTC: exact, case-sensitive raw-string match (see note above).
    const btcHit = OFAC_INDEX.btc.get(addr);
    if (btcHit) return [btcHit];
    return [];
  },
};

// The DEFAULT provider set, stated EXPLICITLY (not silently extended): the local
// seed blocklist PLUS the bundled OFAC SDN snapshot. localBlocklistProvider is
// kept FIRST so that for an address present in both (e.g. the Ronin/Lazarus entry
// the seed list also carries), its richer cited source is the one reported —
// screenAddress de-dupes the OFAC hit for the same address+category. Both are
// purely local; this default still makes no network call.
export const DEFAULT_PROVIDERS = [localBlocklistProvider, ofacSanctionsProvider];

// Turn a normalised match into a human-readable reason string.
function reasonFor(m) {
  const label = CATEGORY_LABELS[m.category] || 'known-bad address';
  const note = m.note ? ` ${m.note}` : '';
  return `Recipient is a ${label}.${note} Source: ${m.source}.`;
}

/**
 * Screen a recipient against one or more providers. LOCAL by default (the shipped
 * providers make no network call). Reports flagged / not-flagged ONLY — it never
 * asserts an address is "safe".
 *
 * ADDRESS-FAMILY ROUTING. `valid` means exactly what it always has: the recipient
 * is a parseable EVM address (norm() succeeds). That meaning is UNCHANGED — a BTC
 * (or other non-EVM) recipient still yields `valid:false`. What changed is that
 * `valid:false` no longer short-circuits screening: we determine the input's family
 * — EVM when norm() succeeds, otherwise a non-empty raw string is treated as a
 * candidate BTC address — and consult each provider only if its declared `families`
 * include that family. EVM lookups receive the NORMALISED (lowercase 0x) address;
 * BTC lookups receive the RAW string verbatim. A provider with no `families` is
 * treated as EVM-only (back-compat with the original { name, screen } contract).
 *
 * CONSEQUENCE: a sanctioned BTC address now screens through the REAL runtime path —
 * it returns `valid:false` (not EVM-parseable) yet can be `flagged:true` with
 * matches/reasons. `valid` is therefore NOT a precondition for `flagged`.
 *
 * @param {string} address                          the recipient to screen
 * @param {{ providers?: Array<{name:string, families?:string[], screen:Function}> }} [opts]
 *        Defaults to DEFAULT_PROVIDERS (local seed blocklist [evm] + OFAC SDN
 *        snapshot [evm,btc]), both LOCAL. Pass an explicit list to override (e.g. to
 *        add a future, opt-in remote provider).
 * @returns {{
 *   valid: boolean,    // recipient is a parseable EVM address (NOT a gate on flagged)
 *   flagged: boolean,  // at least one provider matched it (possible even when !valid)
 *   matches: Array<{ address, category, source, note, provider }>,
 *   reasons: string[]  // human-readable, one per match
 * }}
 */
export function screenAddress(address, { providers = DEFAULT_PROVIDERS } = {}) {
  const evmAddr = norm(address);          // lowercase 0x, or null if not EVM-parseable
  const valid = evmAddr !== null;         // unchanged meaning: parseable EVM address

  // Family of the input: EVM if it normalises, else a non-empty raw string is a
  // candidate BTC address. Non-strings are screenable by nothing. EVM lookups use
  // the normalised form; BTC lookups use the raw string verbatim (case-sensitive).
  const rawBtc = !valid && typeof address === 'string' && address.length > 0 ? address : null;
  const family = valid ? 'evm' : rawBtc ? 'btc' : null;
  const lookup = valid ? evmAddr : rawBtc;

  const matches = [];
  const seen = new Set(); // de-dupe across providers by address+category
  if (family && lookup != null) {
    for (const provider of providers) {
      if (!provider || typeof provider.screen !== 'function') continue;
      // Only consult a provider that handles this input's family. No declared
      // families => EVM-only (back-compat with the original provider contract).
      const families = Array.isArray(provider.families) ? provider.families : ['evm'];
      if (!families.includes(family)) continue;
      let hits;
      try {
        hits = provider.screen(lookup) || [];
      } catch {
        // A misbehaving provider must never break screening — degrade, never block.
        hits = [];
      }
      for (const hit of hits) {
        // EVM hits normalise to lowercase 0x; BTC hits keep their raw string.
        const addr = norm(hit?.address) || hit?.address || lookup;
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
  }

  const reasons = matches.map(reasonFor);
  return { valid, flagged: matches.length > 0, matches, reasons };
}
