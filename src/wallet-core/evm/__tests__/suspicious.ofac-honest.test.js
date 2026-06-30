// wallet-core/evm/__tests__/suspicious.ofac-honest.test.js
//
// Contract test pinning the complete removal of OFAC sanctions screening (audit:
// "OFAC screening — legal review gate still open before shipping").
//
// The project has completely removed OFAC sanctions screening:
//   - PR #263 removed the bundled OFAC SDN snapshot provider
//   - All hand-curated sanctioned entries have been removed
//   - scripts/refresh-ofac-blocklist.mjs (retired) has been deleted
//
// For production compliance screening, wire in an enterprise-licensed API
// (Chainalysis, TRM Labs, Elliptic, etc.) as an additional provider via
// screenAddress(). See docs/OFAC-legal-gate.md for rationale.
//
// This test FAILS if anyone re-introduces OFAC screening in any form.
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
const REFRESH_SCRIPT = resolve(REPO_ROOT, 'scripts/refresh-ofac-blocklist.mjs');

describe('OFAC sanctions screening — completely removed', () => {
  it('DEFAULT_BLOCKLIST contains zero sanctioned entries (OFAC removed)', () => {
    const sanctioned = DEFAULT_BLOCKLIST.filter((e) => e?.category === 'sanctioned');
    expect(sanctioned).toHaveLength(0);
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

  it('the refresh script is deleted', () => {
    expect(existsSync(REFRESH_SCRIPT)).toBe(false);
  });

  it('the legal-gate doc exists and records the complete removal', () => {
    expect(existsSync(LEGAL_GATE_DOC)).toBe(true);
    const doc = readFileSync(LEGAL_GATE_DOC, 'utf8');
    // Pin the load-bearing facts: status (removed), the removal PR, and that
    // bundled snapshots and all OFAC screening are gone.
    expect(doc).toMatch(/removed|HONEST-DISABLED/i);
    expect(doc).toMatch(/#263/);
    expect(doc).toMatch(/enterprise-licensed|runtime API/i);
  });
});
