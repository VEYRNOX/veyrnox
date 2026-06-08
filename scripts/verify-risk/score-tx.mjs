// scripts/verify-risk/score-tx.mjs
//
// Risk Scoring v1 — VERIFICATION INSTRUMENT. NOT product code.
//
// A thin, pure wrapper around the on-device composite scorer (src/risk). It takes
// a "case" — { unsignedTx, activeSetLocalState, chainData } — runs score(), and
// returns the composite verdict plus every signal's individual result. The runner
// (run.mjs) uses it to exercise the read-only scoring paths; later, when you have
// a real confirmed tx, you can also feed its JSON straight in via the CLI below.
//
// IMPORTANT HONESTY BOUNDARY (see README.md): running a case through this
// instrument proves the SCORER BEHAVED as the case input expects. It does NOT
// make a signal "verified". Per the project hard rule, a signal is verified only
// when exercised against a real on-chain pattern: a broadcast txid on an explorer
// (B), a named real resolution / code-at-address source (D), or a real historical
// tx (H). This file never writes "verified" anywhere and never broadcasts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { score } from '../../src/risk/index.js';

// JSON can't serialise BigInt; tx values may be bigint. Render them as decimal
// strings so output is readable and round-trippable.
export function bigintReplacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Run one case through the composite scorer.
 *
 * @param {{
 *   unsignedTx?: object,
 *   activeSetLocalState?: object,
 *   chainData?: object,
 * }} c
 * @returns {{ level, sentence, evidence, signalId, requiresConfirmation, signals }}
 */
export function scoreCase(c) {
  return score(c.unsignedTx ?? {}, c.activeSetLocalState ?? {}, c.chainData ?? {});
}

/**
 * Compare a scorer result against a case's `expect` block.
 *
 * `expect` may assert any of:
 *   - composite: expected composite level (OK|INFO|CAUTION|RISK)
 *   - owner:     expected signalId that owns the verdict (or null when OK)
 *   - signal:    { id, level } — assert a specific signal's individual level
 *
 * Returns { ok, mismatches[] }. A mismatch is a human-readable string.
 */
export function checkExpectations(result, expect = {}) {
  const mismatches = [];

  if ('composite' in expect && result.level !== expect.composite) {
    mismatches.push(`composite: expected ${expect.composite}, got ${result.level}`);
  }
  if ('owner' in expect && result.signalId !== expect.owner) {
    mismatches.push(`owner: expected ${String(expect.owner)}, got ${String(result.signalId)}`);
  }
  if (expect.signal) {
    const s = result.signals.find((x) => x.id === expect.signal.id);
    if (!s) {
      mismatches.push(`signal ${expect.signal.id}: not present in result`);
    } else if (s.level !== expect.signal.level) {
      mismatches.push(`signal ${expect.signal.id}: expected ${expect.signal.level}, got ${s.level}`);
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

// ---- CLI: score a single tx case from a JSON file -------------------------
//
//   node scripts/verify-risk/score-tx.mjs <case.json>
//
// The JSON is a case object: { unsignedTx, activeSetLocalState, chainData, expect? }.
// This is the entry point for a REAL confirmed tx later — export the tx + state to
// JSON and score it here. Prints the composite + per-signal breakdown as JSON.
function isMainModule() {
  // True only when this file is the process entry point — not when imported by
  // run.mjs. Compare normalised absolute paths (correct on Windows + POSIX).
  if (!process.argv[1]) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
}

if (isMainModule()) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/verify-risk/score-tx.mjs <case.json>');
    process.exit(2);
  }
  const c = JSON.parse(readFileSync(path, 'utf8'));
  const result = scoreCase(c);
  const out = { input: path, result };
  if (c.expect) out.check = checkExpectations(result, c.expect);
  console.log(JSON.stringify(out, bigintReplacer, 2));
  if (out.check && !out.check.ok) process.exit(1);
}
