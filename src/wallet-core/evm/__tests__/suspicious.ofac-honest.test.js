// wallet-core/evm/__tests__/suspicious.ofac-honest.test.js
//
// Contract test pinning the HONEST OFAC posture (audit: "OFAC screening — legal
// review gate still open before shipping").
//
// The project DELIBERATELY removed the bundled OFAC SDN snapshot provider in
// PR #263 and deleted src/wallet-core/data/ofac-sanctioned.json, because:
//   - automated bulk pulls from treasury.gov carry commercial ToS constraints, and
//   - a bundled snapshot is stale-by-design and cannot stay delisting-current,
//     which is exactly what reliable sanctions screening requires.
//
// So the honest state is: NO bundled snapshot, NO network provider in the default
// set, and only a single citable hand-curated sanctioned entry (Ronin/Lazarus)
// that does not depend on any automated feed. Full SDN coverage is blocked on
// (a) an independent legal review and (b) an enterprise-licensed RUNTIME API —
// not a re-introduced snapshot. This test FAILS if anyone silently re-adds the
// stale-snapshot machinery, and it pins the legal-gate doc as the audit record.
//
// These assertions check machine CONTRACT (provider set shape, file absence,
// entry category code), not prose copy.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PROVIDERS,
  localBlocklistProvider,
} from '../suspicious.js';
import * as suspicious from '../suspicious.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const SNAPSHOT_PATH = resolve(REPO_ROOT, 'src/wallet-core/data/ofac-sanctioned.json');
const LEGAL_GATE_DOC = resolve(REPO_ROOT, 'docs/OFAC-legal-gate.md');

const RONIN_LAZARUS = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96';

describe('OFAC honest posture — no bundled snapshot, single citable entry', () => {
  it('DEFAULT_BLOCKLIST carries exactly one sanctioned entry and it is Ronin/Lazarus', () => {
    const sanctioned = DEFAULT_BLOCKLIST.filter((e) => e?.category === 'sanctioned');
    expect(sanctioned).toHaveLength(1);
    expect(sanctioned[0].address.toLowerCase()).toBe(RONIN_LAZARUS.toLowerCase());
  });

  it('the default provider set is local-only (no network/snapshot provider)', () => {
    // The removed provider was named "ofac-sdn-snapshot". Nothing in the default
    // set may declare a btc family or a snapshot/ofac name — that would mean the
    // bundled-snapshot machinery has been re-introduced.
    expect(DEFAULT_PROVIDERS).toEqual([localBlocklistProvider]);
    for (const p of DEFAULT_PROVIDERS) {
      const families = Array.isArray(p.families) ? p.families : ['evm'];
      expect(families).toEqual(['evm']); // EVM-only seed list, no BTC snapshot
      expect(p.name).not.toMatch(/ofac|snapshot|sdn/i);
    }
  });

  it('no removed OFAC snapshot provider is exported', () => {
    expect(suspicious.ofacSanctionsProvider).toBeUndefined();
    expect(suspicious.makeOfacProvider).toBeUndefined();
  });

  it('no bundled OFAC snapshot data file exists on disk', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(false);
  });

  it('the legal-gate doc exists and records the honest contract', () => {
    expect(existsSync(LEGAL_GATE_DOC)).toBe(true);
    const doc = readFileSync(LEGAL_GATE_DOC, 'utf8');
    // Pin the load-bearing facts, not phrasing: status tag, the removal PR, the
    // surviving entry, and that a bundled snapshot is explicitly NOT the fix.
    expect(doc).toMatch(/HONEST-DISABLED/);
    expect(doc).toMatch(/#263/);
    expect(doc).toMatch(/0x098B716B/i);
    expect(doc).toMatch(/legal review/i);
  });
});
