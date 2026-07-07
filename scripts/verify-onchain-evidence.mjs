#!/usr/bin/env node
// scripts/verify-onchain-evidence.mjs
//
// On-chain evidence re-confirmation. Reads docs/verified-evidence.json, and for
// every real evidence entry (feature -> { chain, txid }) re-queries a public
// node to confirm the txid STILL resolves and succeeded on-chain. Turns the
// catalogue's "verified" state from a one-time claim into a continuously-checked
// fact — the automation-friendly half of CLAUDE.md's "verify, don't assert".
//
//   node scripts/verify-onchain-evidence.mjs [--allow-unreachable] [--json]
//
// This job makes LIVE network calls, so it is NOT part of the hermetic unit suite
// (npm test). It runs on a schedule via .github/workflows/verify-onchain-evidence.yml.
// The pure parsing/interpretation logic lives in scripts/lib/evidence-onchain.mjs
// and IS unit-tested (src/lib/__tests__/evidenceOnchain.test.js).
//
// Exit codes:
//   0  all entries CONFIRMED (or only UNREACHABLE with --allow-unreachable)
//   1  at least one FAILED (definitive regression: reverted / not found), OR any
//      UNREACHABLE without --allow-unreachable
//
// --allow-unreachable downgrades transient network/RPC outages to warnings so a
// nightly canary doesn't page on a flaky public node — a genuinely reverted or
// missing txid still fails hard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  collectEvidence,
  chainConfig,
  buildProbe,
  interpretProbe,
  CONFIRMED,
  FAILED,
  UNREACHABLE,
} from './lib/evidence-onchain.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..');
const EVIDENCE_PATH = 'docs/verified-evidence.json';

const RETRIES = 2;
const TIMEOUT_MS = 15000;

async function fetchJson(probe) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(probe.url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      // Esplora returns 404 for an unknown tx — a definitive signal, not an error.
      if (probe.kind === 'btc-esplora' && res.status === 404) return { __httpStatus: 404 };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function checkRow(row) {
  const cfg = chainConfig(row.chain);
  if (!cfg) {
    return { ...row, verdict: UNREACHABLE, detail: `unknown chain "${row.chain}" (add it to CHAINS)` };
  }
  const probe = buildProbe(row.chain, row.txid);
  try {
    const parsed = await fetchJson(probe);
    const { verdict, detail } = interpretProbe(probe.kind, parsed);
    return { ...row, verdict, detail, explorer: cfg.explorer };
  } catch (err) {
    return { ...row, verdict: UNREACHABLE, detail: `network: ${err.message}`, explorer: cfg.explorer };
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowUnreachable = args.has('--allow-unreachable');
  const asJson = args.has('--json');

  let evidenceJson;
  try {
    evidenceJson = JSON.parse(readFileSync(join(REPO_ROOT, EVIDENCE_PATH), 'utf8'));
  } catch (err) {
    console.error(`BLOCKED: cannot read/parse ${EVIDENCE_PATH}: ${err.message}`);
    process.exit(1);
  }

  const rows = collectEvidence(evidenceJson);
  if (rows.length === 0) {
    console.log('OK: no on-chain evidence entries to re-confirm (evidence map empty).');
    process.exit(0);
  }

  const results = await Promise.all(rows.map(checkRow));

  const failed = results.filter((r) => r.verdict === FAILED);
  const unreachable = results.filter((r) => r.verdict === UNREACHABLE);
  const confirmed = results.filter((r) => r.verdict === CONFIRMED);

  if (asJson) {
    console.log(JSON.stringify({ confirmed: confirmed.length, failed, unreachable }, null, 2));
  } else {
    for (const r of results) {
      const tag = r.verdict === CONFIRMED ? 'OK  ' : r.verdict === FAILED ? 'FAIL' : 'WARN';
      console.log(`${tag}  ${r.chain.padEnd(18)} ${r.txid.slice(0, 14)}…  ${r.feature.slice(0, 44).padEnd(44)} ${r.detail}`);
    }
    console.log(`\n${confirmed.length} confirmed · ${failed.length} failed · ${unreachable.length} unreachable (of ${results.length})`);
  }

  if (failed.length > 0) {
    console.error(`\nBLOCKED: ${failed.length} evidence txid(s) no longer confirm on-chain — a "verified" claim regressed.`);
    process.exit(1);
  }
  if (unreachable.length > 0 && !allowUnreachable) {
    console.error(`\nBLOCKED: ${unreachable.length} entr(y/ies) unreachable. Re-run, or pass --allow-unreachable to treat transient outages as warnings.`);
    process.exit(1);
  }
  console.log('\nOK: all reachable evidence txids still confirm on-chain.');
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('verify-onchain-evidence.mjs');
if (isMain) main();
