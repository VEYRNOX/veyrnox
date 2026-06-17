#!/usr/bin/env node
// scripts/check-crypto-rng.mjs
//
// CI GUARD: fail the build if Math.random() (or other non-CSPRNG sources)
// appear anywhere in security-sensitive paths. This is the automated tripwire
// for the exact class of bug found in the original code.
//
//   node scripts/check-crypto-rng.mjs
//
// Wire into package.json: "pretest": "node scripts/check-crypto-rng.mjs"
// and into your CI pipeline as a required check.

import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
// Shared, self-tested scanner (regex/template-aware, line-number-preserving).
// One implementation so this guard and the audit:eth harness can't drift.
import { walk, stripCommentsAndStrings, EXTS } from './audit/lib/source-scan.mjs';

// Directories whose contents must never use non-cryptographic randomness.
// `src/wallet-core` is walked RECURSIVELY, so every chain stack underneath it is
// covered automatically: evm/, btc/, AND sol/ (Phase SOL — ed25519 key material
// must come from the CSPRNG-seeded BIP-39 path, never Math.random).
const GUARDED_DIRS = ['src/wallet-core', 'src/lib/WalletProvider.jsx'];
// Extend with any path that touches keys/seeds/signing as you build them out.

const BANNED = [
  { re: /\bMath\.random\s*\(/, msg: 'Math.random() is not a CSPRNG' },
  { re: /\bDate\.now\s*\(\)\s*%/, msg: 'Date.now() used as randomness' },
];

let violations = 0;

function scanFile(p) {
  if (!EXTS.has(extname(p))) return;
  const src = stripCommentsAndStrings(readFileSync(p, 'utf8'));
  src.split('\n').forEach((line, i) => {
    for (const { re, msg } of BANNED) {
      if (re.test(line)) {
        console.error(`✗ ${p}:${i + 1}  ${msg}\n    ${line.trim()}`);
        violations++;
      }
    }
  });
}

function scanPath(p) {
  let s;
  try { s = statSync(p); } catch { return; }
  if (s.isDirectory()) for (const f of walk(p)) scanFile(f);
  else scanFile(p);
}

for (const d of GUARDED_DIRS) scanPath(d);

if (violations > 0) {
  console.error(`\nBLOCKED: ${violations} insecure-RNG usage(s) in guarded crypto paths.`);
  process.exit(1);
}
console.log('✓ crypto-rng check passed: no insecure randomness in guarded paths.');
