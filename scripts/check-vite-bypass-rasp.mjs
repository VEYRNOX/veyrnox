#!/usr/bin/env node
// scripts/check-vite-bypass-rasp.mjs
//
// CI GUARD (issue #1107): fail the build if any `.env*` file in the repo
// contains `VITE_BYPASS_RASP=1`. That env var is a dev-only override in
// src/rasp/useRaspArtifact.js that returns CLEAN unconditionally — if it
// leaks into a release build the entire RASP layer is silently disabled.
//
//   node scripts/check-vite-bypass-rasp.mjs
//
// Wired into package.json as "check:vite-bypass-rasp" and into CI
// (.github/workflows/ci.yml verify job), same pattern as
// scripts/check-deniability-strings.mjs.
//
// No dependencies beyond Node builtins. Pure ESM. Cross-platform.
//
// This is Layer 1 of the two-layer fix. Layer 2 is a runtime fail-loud in
// useRaspArtifact.js that logs `[SECURITY] VITE_BYPASS_RASP is enabled in
// a PRODUCTION build …` and returns TIER.BLOCK when the flag is set on
// `import.meta.env.PROD` — so even if this CI gate is bypassed, a shipped
// release build with the flag on fails closed instead of silently allowing.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import assert from 'node:assert/strict';

export const SCAN_ROOT = '.';

// Skip vendored / build / VCS directories.
const SKIP_DIR = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.vite', 'ios', 'android', 'patches',
]);

// A file is a `.env*` file if its basename starts with `.env`. Matches
// `.env`, `.env.local`, `.env.production`, `.env.development.local`, etc.
export function isEnvFile(name) {
  return name.startsWith('.env');
}

// Match `VITE_BYPASS_RASP=1` on its own line (allowing leading whitespace,
// optional `export`, optional surrounding quotes on the value, optional
// trailing whitespace/comment). Does NOT match a commented-out line
// (leading `#`), so `# VITE_BYPASS_RASP=1` in a template file is fine.
export const BYPASS_RASP_ENABLED_RE =
  /^\s*(?:export\s+)?VITE_BYPASS_RASP\s*=\s*["']?1["']?\s*(?:#.*)?$/m;

/**
 * Scan a single env-file's contents.
 * @param {string} source raw file contents
 * @returns {boolean} true iff the file enables VITE_BYPASS_RASP.
 */
export function scanEnvSource(source) {
  return BYPASS_RASP_ENABLED_RE.test(source);
}

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, acc);
    else if (isEnvFile(basename(p))) acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Self-test — in-process sanity check that the matcher catches a vulnerable
// fixture string and does not false-positive on a commented-out line or an
// unrelated Vite env var. Runs before the real tree walk on every main()
// invocation, so a future edit that silently regresses the rule (e.g. an
// overly-narrow regex) fails CI immediately.
// ---------------------------------------------------------------------------

export function runSelfTest() {
  // Vulnerable fixture (the exact bug this script exists to catch).
  const vulnerable = 'VITE_BYPASS_RASP=1\n';
  assert.ok(
    scanEnvSource(vulnerable),
    'check-vite-bypass-rasp self-test FAILED: matcher did not flag a bare `VITE_BYPASS_RASP=1` line — the check has regressed.'
  );

  // Same, with an `export` prefix and a trailing comment.
  const vulnerableExported = 'export VITE_BYPASS_RASP=1 # DEV ONLY\n';
  assert.ok(
    scanEnvSource(vulnerableExported),
    'check-vite-bypass-rasp self-test FAILED: matcher did not flag an `export`-prefixed line with trailing comment.'
  );

  // Quoted value ("1" or '1') — still enables the flag.
  assert.ok(
    scanEnvSource('VITE_BYPASS_RASP="1"\n'),
    'check-vite-bypass-rasp self-test FAILED: matcher did not flag a quoted "1" value.'
  );

  // MUST NOT flag: commented-out line (documentation/template pattern).
  assert.ok(
    !scanEnvSource('# VITE_BYPASS_RASP=1\n'),
    'check-vite-bypass-rasp self-test FAILED: matcher false-positived on a commented-out line.'
  );

  // MUST NOT flag: explicitly disabled.
  assert.ok(
    !scanEnvSource('VITE_BYPASS_RASP=0\n'),
    'check-vite-bypass-rasp self-test FAILED: matcher false-positived on VITE_BYPASS_RASP=0.'
  );

  // MUST NOT flag: unrelated Vite env var.
  assert.ok(
    !scanEnvSource('VITE_DEMO_MODE=1\n'),
    'check-vite-bypass-rasp self-test FAILED: matcher false-positived on an unrelated VITE_ env var.'
  );

  // MUST NOT flag: substring in a different key.
  assert.ok(
    !scanEnvSource('MY_VITE_BYPASS_RASP_LOG=1\n'),
    'check-vite-bypass-rasp self-test FAILED: matcher false-positived on a differently-named key.'
  );
}

function main() {
  runSelfTest();

  const files = walk(SCAN_ROOT);
  const hits = [];
  for (const f of files) {
    let source;
    try { source = readFileSync(f, 'utf8'); } catch { continue; }
    if (scanEnvSource(source)) hits.push(f);
  }

  if (hits.length > 0) {
    for (const f of hits) {
      console.error(`${f}: contains VITE_BYPASS_RASP=1 [BYPASS-RASP-IN-ENV]`);
    }
    console.error(
      `\nBLOCKED: ${hits.length} env file(s) enable VITE_BYPASS_RASP. ` +
      `This flag disables ALL RASP checks and must NEVER ship in a release build. ` +
      `Remove or comment out (# VITE_BYPASS_RASP=1) the line and re-run.`
    );
    process.exit(1);
  }
  console.log('OK: check-vite-bypass-rasp passed, no env files enable VITE_BYPASS_RASP.');
}

const isMain = process.argv[1] && process.argv[1].endsWith('check-vite-bypass-rasp.mjs');
if (isMain) main();
