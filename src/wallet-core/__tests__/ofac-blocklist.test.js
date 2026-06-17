// wallet-core/__tests__/ofac-blocklist.test.js
//
// Phase S2 — tests for the LOCAL OFAC SDN sanctions provider that EXTENDS the
// existing suspicious.js screen (ofacSanctionsProvider). Network-free: the
// provider reads only the bundled, dated snapshot (data/ofac-sanctioned.json).
//
// These assert against #70's screen API — screenAddress(addr, { providers })
// returning { valid, flagged, matches, reasons }, with array-returning providers
// shaped { address, category, source, note }. Coverage:
//   - a real OFAC-designated EVM address (Ronin/Lazarus) is flagged 'sanctioned'
//   - a clean address is NOT flagged and NO "safe" claim is ever made
//   - a DELISTED address (Tornado Cash, removed 2025) is ABSENT and not flagged
//   - provenance _meta carries source / MIT+0xB10C attribution / license / date
//   - a sanctioned BTC (XBT) address is flagged THROUGH screenAddress (the real
//     runtime path) — valid:false (non-EVM) yet flagged:true; a near-miss is not
//   - the provider composes through screenAddress alongside the local blocklist

import { describe, it, expect } from 'vitest';
import {
  screenAddress,
  ofacSanctionsProvider,
  localBlocklistProvider,
  DEFAULT_PROVIDERS,
  OFAC_SNAPSHOT_META,
  ofacSnapshotAgeDays,
  ofacSnapshotDisclosure,
} from '../evm/suspicious.js';
import ofacSnapshot from '../data/ofac-sanctioned.json';

// OFAC snapshot-age disclosure (internal audit EVM-#2): the sanctions warning must
// carry the data's vintage so a stale snapshot's false-NEGATIVE risk is visible.
describe('OFAC snapshot age disclosure', () => {
  // snapshotDate is fixed (2026-06-03); inject `now` so the test is deterministic.
  const D = Date.parse(OFAC_SNAPSHOT_META.snapshotDate);
  it('computes whole-day age from the snapshot date (now injected)', () => {
    expect(ofacSnapshotAgeDays(D)).toBe(0);
    expect(ofacSnapshotAgeDays(D + 10 * 86_400_000)).toBe(10);
    expect(ofacSnapshotAgeDays(D + 86_400_000 * 1.9)).toBe(1); // floors
  });
  it('never reports a negative age (clock skew / pre-dated now)', () => {
    expect(ofacSnapshotAgeDays(D - 5 * 86_400_000)).toBe(0);
  });
  it('disclosure names the date and the age, and flags possible newer sanctions', () => {
    const s = ofacSnapshotDisclosure(D + 7 * 86_400_000);
    expect(s).toContain(OFAC_SNAPSHOT_META.snapshotDate);
    expect(s).toContain('7 days old');
    expect(s).toMatch(/more recent sanctioning may not be reflected/i);
  });
  it('singularises one day', () => {
    expect(ofacSnapshotDisclosure(D + 86_400_000)).toContain('1 day old');
  });
});

// OFAC-designated (Apr 2022) — Lazarus Group / Ronin Bridge exploiter. Present in
// BOTH the seed blocklist and the OFAC snapshot.
const RONIN = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96';

// A sanctioned EVM address that lives ONLY in the OFAC snapshot (not in the seed
// blocklist) — proves the OFAC provider, not the seed list, produced the match.
const OFAC_ONLY_EVM = '0x0330070fd38ec3bb94f58fa55d40368271e9e54a';

// DELISTED: OFAC removed the Tornado Cash contracts in 2025 (Van Loon v. Treasury,
// 5th Cir.). A rebuild-from-current snapshot must NOT carry it — a stale
// 'sanctioned' flag would be a false accusation.
const TORNADO_DELISTED = '0x8589427373D6D84E98730D7795D8f6f8731FDA16';

// A fresh EOA on neither list (hardhat default acct #1) — used to confirm we never
// assert "safe", only "not flagged".
const CLEAN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// A real XBT (Bitcoin) entry from the snapshot, matched as a raw case-sensitive
// string, plus a one-character near-miss that must NOT match.
const BTC_SANCTIONED = '123WBUDmSJv4GctdVEz6Qq6z8nXSKrJ4KX';
const BTC_NEAR_MISS = '123WBUDmSJv4GctdVEz6Qq6z8nXSKrJ4KY'; // final X -> Y

describe('ofacSanctionsProvider — EVM sanctions hits', () => {
  it('flags the Ronin/Lazarus address as sanctioned via screenAddress (default providers)', () => {
    const r = screenAddress(RONIN);
    expect(r.valid).toBe(true);
    expect(r.flagged).toBe(true);
    const sanctioned = r.matches.filter((m) => m.category === 'sanctioned');
    expect(sanctioned.length).toBeGreaterThan(0);
    expect(sanctioned[0].source).toMatch(/OFAC/i);
    expect(r.reasons.join(' ')).toMatch(/sanctioned/i);
  });

  it('the OFAC provider itself returns the Ronin entry, shaped per the contract', () => {
    const hits = ofacSanctionsProvider.screen(RONIN.toLowerCase());
    expect(Array.isArray(hits)).toBe(true);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      address: RONIN.toLowerCase(),
      category: 'sanctioned',
    });
    expect(typeof hits[0].source).toBe('string');
    expect(typeof hits[0].note).toBe('string');
  });
});

describe('ofacSanctionsProvider — clean address (never asserts "safe")', () => {
  it('does not flag an unlisted address and emits no "safe" verdict', () => {
    // Screen against the OFAC provider alone so the result reflects only OFAC.
    const r = screenAddress(CLEAN, { providers: [ofacSanctionsProvider] });
    expect(r.valid).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.matches).toEqual([]);
    expect(r.reasons).toEqual([]);
    expect(r).not.toHaveProperty('safe');
    expect(JSON.stringify(r).toLowerCase()).not.toContain('"safe"');
  });
});

describe('ofacSanctionsProvider — delisting hygiene', () => {
  it('does NOT carry the delisted Tornado Cash address in the snapshot', () => {
    const present = ofacSnapshot.entries.some(
      (e) => String(e.address).toLowerCase() === TORNADO_DELISTED.toLowerCase()
    );
    expect(present).toBe(false);
  });

  it('does not flag the delisted address', () => {
    expect(ofacSanctionsProvider.screen(TORNADO_DELISTED.toLowerCase())).toEqual([]);
    expect(screenAddress(TORNADO_DELISTED, { providers: [ofacSanctionsProvider] }).flagged).toBe(false);
  });
});

describe('OFAC_SNAPSHOT_META — provenance / attribution', () => {
  it('exposes source, MIT + 0xB10C attribution, license, and a snapshot date', () => {
    expect(OFAC_SNAPSHOT_META).toBeTruthy();
    expect(OFAC_SNAPSHOT_META.source).toMatch(/treasury\.gov|ofac/i);
    expect(OFAC_SNAPSHOT_META.attribution).toMatch(/MIT/);
    expect(OFAC_SNAPSHOT_META.attribution).toMatch(/0xB10C/);
    expect(OFAC_SNAPSHOT_META.license).toMatch(/MIT/);
    expect(OFAC_SNAPSHOT_META.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('ofacSanctionsProvider — BTC (XBT) verbatim matching', () => {
  it('flags a sanctioned BTC address verbatim THROUGH screenAddress (the real runtime path)', () => {
    // Screen via screenAddress — NOT ofacSanctionsProvider.screen() directly — so
    // this exercises the family-routing the send/simulate flow actually uses.
    const r = screenAddress(BTC_SANCTIONED);
    // BTC is not EVM-parseable, so `valid` stays false (unchanged meaning) — but the
    // address must still be flagged with a 'sanctioned' match.
    expect(r.valid).toBe(false);
    expect(r.flagged).toBe(true);
    const sanctioned = r.matches.filter((m) => m.category === 'sanctioned');
    expect(sanctioned).toHaveLength(1);
    expect(sanctioned[0].address).toBe(BTC_SANCTIONED); // raw string preserved (not 0x-lowercased)
    expect(sanctioned[0].provider).toBe('ofac-sdn-snapshot');
    expect(r.reasons.join(' ')).toMatch(/sanctioned/i);
  });

  it('does not flag a one-character near-miss, nor a case-folded variant, through screenAddress', () => {
    // BTC matching is exact and case-sensitive: a single changed char or a
    // case-fold is a miss, and a miss is NOT flagged (and never asserted "safe").
    expect(screenAddress(BTC_NEAR_MISS).flagged).toBe(false);
    expect(screenAddress(BTC_SANCTIONED.toLowerCase()).flagged).toBe(false);
  });
});

describe('ofacSanctionsProvider — composition through screenAddress', () => {
  it('is part of DEFAULT_PROVIDERS alongside the local blocklist', () => {
    expect(DEFAULT_PROVIDERS).toContain(localBlocklistProvider);
    expect(DEFAULT_PROVIDERS).toContain(ofacSanctionsProvider);
  });

  it('REGRESSION: a sanctioned BTC address is flagged through the DEFAULT screenAddress path (BTC screening gap)', () => {
    // The gap this guards: screenAddress used to short-circuit ANY non-EVM input
    // before consulting providers, so a sanctioned BTC recipient was never screened
    // on the real runtime path (simulate.js -> screenAddress(effectiveRecipient)).
    // With family routing, the OFAC provider (families: ['evm','btc']) is now
    // consulted for a raw BTC string even though `valid` is false.
    const r = screenAddress(BTC_SANCTIONED); // default providers — the runtime default
    expect(r.valid).toBe(false); // BTC is not EVM-parseable...
    expect(r.flagged).toBe(true); // ...but it MUST still be flagged
    const m = r.matches.find((x) => x.category === 'sanctioned');
    expect(m).toBeTruthy();
    expect(m.provider).toBe('ofac-sdn-snapshot');
    // The EVM-only local blocklist must NOT have been consulted for a BTC string.
    expect(r.matches.every((x) => x.provider === 'ofac-sdn-snapshot')).toBe(true);
  });

  it('an OFAC-only EVM address is flagged through the default screen, attributed to the OFAC provider', () => {
    const r = screenAddress(OFAC_ONLY_EVM);
    expect(r.flagged).toBe(true);
    const m = r.matches.find((x) => x.category === 'sanctioned');
    expect(m).toBeTruthy();
    expect(m.provider).toBe('ofac-sdn-snapshot');
  });

  it('composes alongside the local blocklist — the local provider still catches its own entries', () => {
    // Both providers active; a burn/null sink is caught by the LOCAL provider, an
    // OFAC-only address by the OFAC provider — proving they compose, not replace.
    const burn = screenAddress('0x000000000000000000000000000000000000dEaD', {
      providers: [localBlocklistProvider, ofacSanctionsProvider],
    });
    expect(burn.matches.some((m) => m.category === 'burn' && m.provider === 'local-blocklist')).toBe(true);

    const ofac = screenAddress(OFAC_ONLY_EVM, {
      providers: [localBlocklistProvider, ofacSanctionsProvider],
    });
    expect(ofac.matches.some((m) => m.category === 'sanctioned' && m.provider === 'ofac-sdn-snapshot')).toBe(true);
  });
});
