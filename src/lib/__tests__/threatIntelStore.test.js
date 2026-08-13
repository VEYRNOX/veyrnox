// lib/__tests__/threatIntelStore.test.js
//
// Contract tests for the local threat-intel store behind Sentinel.
//
// Two things are pinned here that a future edit could silently break:
//   1. I3 — a deniability/demo session must learn nothing and reveal nothing.
//      Sentinel screens on every keystroke in the send flow, so an ungated
//      lookup would let a coerced session probe which addresses the real user
//      has been warned about.
//   2. The sanctions gate — SEED_THREATS must stay free of bundled sanctions
//      data (docs/OFAC-legal-gate.md). This is the seed-list counterpart to
//      suspicious.ofac-honest.test.js, which only inspects DEFAULT_BLOCKLIST and
//      would NOT catch a re-introduction through this file.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const deniability = { active: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniability.active,
  isDeniabilitySessionActive: () => deniability.active,
}));

const { SEED_THREATS, lookupThreatSync, learnThreat, cacheTipResult } = await import('../threatIntelStore.js');

// Any real seed entry — picked at runtime so the test does not pin one address.
const SEEDED = SEED_THREATS[0].address;

beforeEach(() => {
  deniability.active = false;
});

describe('threatIntelStore — OFAC seed (owner override 2026-08-13)', () => {
  // docs/OFAC-legal-gate.md "Owner override" section re-opened the gate.
  // The prior tests ("bundles ZERO sanctioned entries" / "cites no OFAC/SDN
  // source") pinned the closed state; both were deleted with the override.
  // This test now asserts the opposite property so a silent removal of the
  // OFAC entries in a later PR fails loudly.
  it('bundles at least one OFAC-sourced entry', () => {
    const ofacSourced = SEED_THREATS.filter((e) => /ofac|sdn/i.test(e?.source || ''));
    expect(ofacSourced.length).toBeGreaterThan(0);
  });
});

describe('threatIntelStore — seed data hygiene', () => {
  it('contains no duplicate addresses (one address, one verdict)', () => {
    // A duplicate renders two detail rows for one address in the Sentinel
    // banner — and if the notes disagree, the user is shown two contradictory
    // attributions as fact.
    const seen = new Map();
    for (const e of SEED_THREATS) {
      const key = e.address.toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('stores every seed address lowercased so lookups match', () => {
    const notLower = SEED_THREATS.filter((e) => e.address !== e.address.toLowerCase());
    expect(notLower).toEqual([]);
  });
});

describe('threatIntelStore — I3 deniability gate', () => {
  it('matches a seeded address in a real session', () => {
    // Pre-condition: without this the deniability assertions below would pass
    // vacuously against a store that never matches anything.
    expect(lookupThreatSync(SEEDED).length).toBeGreaterThan(0);
  });

  it('returns nothing in a deniability/demo session', () => {
    deniability.active = true;
    expect(lookupThreatSync(SEEDED)).toEqual([]);
  });

  it('is case-insensitive on the caller side', () => {
    expect(lookupThreatSync(SEEDED.toUpperCase()).length).toBeGreaterThan(0);
  });

  it('learns nothing in a deniability/demo session', async () => {
    const ADDR = '0x9999999999999999999999999999999999999999';
    deniability.active = true;
    await learnThreat({
      address: ADDR,
      category: 'scam',
      source: 'Veyrnox TIP',
      note: 'must not persist',
      severity: 'high',
    });

    // Reading is ungated by design (a read leaves no trace), so a row written
    // during a decoy session WOULD be visible here — that is exactly what makes
    // the write gate the thing worth asserting.
    deniability.active = false;
    const row = await new Promise((resolve) => {
      const req = indexedDB.open('veyrnox-threat-intel');
      // Do NOT let a read CREATE the database. open() with no existing DB fires
    // onupgradeneeded and would leave an empty, STORELESS db at the same
    // version — after which learnThreat()'s transaction(STORE_NAME) throws and
    // is swallowed by its catch, silently disabling writes for the whole run.
    // Aborting here keeps the read side-effect-free (same guard as panic.js).
    req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch { /* ignore */ } };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('threats')) { db.close(); resolve(null); return; }
        const r = db.transaction('threats', 'readonly').objectStore('threats').get(ADDR);
        r.onsuccess = () => { const v = r.result; db.close(); resolve(v ?? null); };
        r.onerror = () => { db.close(); resolve(null); };
      };
    });
    expect(row).toBeNull();
  });
});

describe('cacheTipResult — sanctions are runtime-only, never persisted', () => {
  // The owner decision is that OFAC/sanctions data comes from the TIP runtime
  // API rather than a bundled list (docs/OFAC-legal-gate.md permits exactly
  // that). The corollary this pins: "from TIP" has to mean EVERY time. A cached
  // sanctions verdict is a bundled list with extra steps — it cannot track a
  // DELISTING, so it decays into the same false accusation the gate exists to
  // prevent. Non-sanctions signals have no equivalent legal hazard and cache
  // normally.
  const read = (addr) => new Promise((resolve) => {
    const req = indexedDB.open('veyrnox-threat-intel');
    // Do NOT let a read CREATE the database. open() with no existing DB fires
    // onupgradeneeded and would leave an empty, STORELESS db at the same
    // version — after which learnThreat()'s transaction(STORE_NAME) throws and
    // is swallowed by its catch, silently disabling writes for the whole run.
    // Aborting here keeps the read side-effect-free (same guard as panic.js).
    req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch { /* ignore */ } };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('threats')) { db.close(); resolve(null); return; }
      const r = db.transaction('threats', 'readonly').objectStore('threats').get(addr);
      r.onsuccess = () => { const v = r.result; db.close(); resolve(v ?? null); };
      r.onerror = () => { db.close(); resolve(null); };
    };
  });

  it('does NOT persist a sanctions hit', async () => {
    const ADDR = '0xaaaa000000000000000000000000000000000001';
    await cacheTipResult(ADDR, {
      verdict: 'block',
      sanctions: true,
      signals: [{ signal_type: 'sanctions_hit', source: 'TIP', confidence: 1 }],
    });
    expect(await read(ADDR)).toBeNull();
  });

  it('DOES persist a non-sanctions signal (so the test above is not vacuous)', async () => {
    const ADDR = '0xaaaa000000000000000000000000000000000002';
    await cacheTipResult(ADDR, {
      verdict: 'block',
      sanctions: false,
      signals: [{ signal_type: 'scam_report', source: 'chainabuse', confidence: 0.9 }],
    });
    const row = await read(ADDR);
    expect(row).not.toBeNull();
    expect(row.category).toBe('scam');
    expect(row.category).not.toBe('sanctioned');
  });

  it('ignores an allow verdict entirely', async () => {
    const ADDR = '0xaaaa000000000000000000000000000000000003';
    await cacheTipResult(ADDR, { verdict: 'allow', sanctions: false, signals: [] });
    expect(await read(ADDR)).toBeNull();
  });
});
