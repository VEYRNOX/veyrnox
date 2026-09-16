#!/usr/bin/env node
//
// Tracked .env files may contain VITE_* keys and nothing else.
//
// `.gitignore` ignores `.env.*` and then negates the build-config ones
// (`.env.staging`, `.env.production`, `.env.canary`), because Vite bakes every
// `VITE_*` var into the shipped bundle anyway — a VITE_-prefixed value is
// public by construction and committing it leaks nothing.
//
// That rationale is load-bearing and it is ONLY true for the VITE_ prefix.
// This repository is PUBLIC, so the first non-VITE_ key added to one of these
// files is a real secret published to the world.
//
// The rule is exact rather than heuristic on purpose: no entropy guessing, no
// false positives, and it fires on the SHAPE of the mistake rather than on any
// particular provider's token format — which is the half GitHub's own secret
// scanning already covers, and only for patterns it recognises.
//
// Scope: what is TRACKED, not what is on disk. An untracked `.env.local` full
// of real secrets is fine and expected.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z', '.env*'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(f => !f.endsWith('.example'));

// `KEY=` at the start of a line. Captures the key only — values are never
// read, printed, or compared, so this script cannot itself leak one.
const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

let failed = false;

for (const file of tracked) {
  const offenders = readFileSync(file, 'utf8')
    .split('\n')
    .map(line => line.match(ASSIGNMENT)?.[1])
    .filter(key => key && !key.startsWith('VITE_'));

  if (offenders.length) {
    failed = true;
    for (const key of new Set(offenders)) {
      console.error(`[check-tracked-env-files] FAIL: ${file} sets non-VITE_ key ${key}`);
    }
  }
}

if (failed) {
  console.error(
    '[check-tracked-env-files] Tracked .env files are published to a PUBLIC repo. ' +
    'Move the value to a platform secret store (Cloudflare Pages / Supabase / GitHub Secrets) ' +
    'and read it server-side, or keep it in an untracked .env.local.'
  );
  process.exit(1);
}

console.log(`[check-tracked-env-files] PASS: ${tracked.length} tracked .env file(s), VITE_ keys only.`);
