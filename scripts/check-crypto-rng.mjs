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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// Directories whose contents must never use non-cryptographic randomness.
const GUARDED_DIRS = ['src/wallet-core', 'src/lib/WalletProvider.jsx'];
// Extend with any path that touches keys/seeds/signing as you build them out.

const BANNED = [
  { re: /\bMath\.random\s*\(/, msg: 'Math.random() is not a CSPRNG' },
  { re: /\bDate\.now\s*\(\)\s*%/, msg: 'Date.now() used as randomness' },
];

const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
let violations = 0;

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    scanFile(p);
  }
}

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
  if (s.isDirectory()) walk(p);
  else scanFile(p);
}

for (const d of GUARDED_DIRS) scanPath(d);

// Remove // line comments, /* block comments */, and string literals so the
// scanner only flags real code. Block comments preserve newlines to keep
// reported line numbers accurate.
function stripCommentsAndStrings(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') out += '\n'; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

if (violations > 0) {
  console.error(`\nBLOCKED: ${violations} insecure-RNG usage(s) in guarded crypto paths.`);
  process.exit(1);
}
console.log('✓ crypto-rng check passed: no insecure randomness in guarded paths.');
