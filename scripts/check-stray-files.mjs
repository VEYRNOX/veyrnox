#!/usr/bin/env node
// Stray-artifact gate for CI.
//
// FAILS the build if the git index contains files that look like accidental
// shell-redirection artifacts. Three zero-byte files with shell-fragment names
// (`per-page`, `false))`, `!(r.topic`) reached main this way — an unquoted
// command fragment gets parsed as a redirection and creates an empty file,
// which then rides along in a broad `git add`. Two independent signals:
//
//   1. Zero-byte tracked files (the empty-blob hash) outside the allowlist.
//      Intentionally empty files (e.g. `.gitkeep`) are allowlisted below.
//   2. Tracked filenames containing shell metacharacters — `(`, `)`, `!`,
//      `;`, `&`, `|`, quotes, or whitespace — which no legitimate file in
//      this repo uses.
//
// A .gitignore pattern cannot catch these: the names are unpredictable and
// gitignore cannot express "zero bytes". This gate runs on the index, so it
// catches the artifact at the PR that would introduce it.
//
// Run: `node scripts/check-stray-files.mjs` (or `npm run check:strays`).

import { execFileSync } from 'node:child_process';

/** SHA-1 of the empty blob — a zero-byte file's object id in git. */
const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

/** Exact tracked paths (or basenames) that are legitimately empty. */
const EMPTY_ALLOWLIST = new Set(['.gitkeep', '.keep']);

/** Shell metacharacters that mark a filename as a command fragment. */
const SHELL_FRAGMENT = /[()!;&|'"\s]/;

// -z gives NUL-separated records immune to quoting of odd filenames.
const raw = execFileSync('git', ['ls-files', '-s', '-z'], { encoding: 'utf8' });

const failures = [];
for (const record of raw.split('\0')) {
  if (!record) continue;
  // Format: "<mode> <hash> <stage>\t<path>"
  const tab = record.indexOf('\t');
  const [, hash] = record.slice(0, tab).split(' ');
  const path = record.slice(tab + 1);
  const basename = path.split('/').pop();

  if (hash === EMPTY_BLOB && !EMPTY_ALLOWLIST.has(basename)) {
    failures.push(`zero-byte tracked file: ${JSON.stringify(path)}`);
  }
  if (SHELL_FRAGMENT.test(basename)) {
    failures.push(`shell-fragment filename: ${JSON.stringify(path)}`);
  }
}

if (failures.length > 0) {
  console.error('Stray-artifact gate FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nThese look like accidental shell-redirection artifacts. Remove them',
  );
  console.error(
    '(`git rm <file>`) or, if a file is intentionally empty, add its basename',
  );
  console.error('to EMPTY_ALLOWLIST in scripts/check-stray-files.mjs.');
  process.exit(1);
}

console.log('check-stray-files: OK — no stray artifacts in the git index.');
