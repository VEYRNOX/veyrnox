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
// SECOND SIGNAL (working tree). The index check above is a last-line net: it
// cannot fire until someone has already staged the artifact. In practice the
// stray sits UNTRACKED in the tree for a while first, then rides along in a
// broad `git add`. So we also scan untracked files and WARN — non-fatal, so a
// dev's scratch files can never block `npm test`, and CI (clean tree) is a
// no-op. The goal is to surface the artifact at creation, before it is staged.
//
// The untracked scan uses a TIGHTER name signal than the index scan
// (UNTRACKED_FRAGMENT below): whitespace is excluded, because untracked files
// with spaces in the name are ordinary on Windows and would false-positive.
//
// Known mechanism: unquoted/partially-quoted JS containing `=>` reaches bash.
// `=` binds to the preceding word, `>` becomes a redirect, and the token after
// it becomes a zero-byte file. Reproduced 2026-07-19:
//   bash -c "echo x => \"el.classList.contains('line-through')\""
//   → creates: el.classList.contains('line-through')  (0 bytes)
//
// Run: `node scripts/check-stray-files.mjs` (or `npm run check:strays`).

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

/** SHA-1 of the empty blob — a zero-byte file's object id in git. */
const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';

/** Exact tracked paths (or basenames) that are legitimately empty. */
const EMPTY_ALLOWLIST = new Set(['.gitkeep', '.keep']);

/** Shell metacharacters that mark a filename as a command fragment. */
const SHELL_FRAGMENT = /[()!;&|'"\s]/;

/**
 * Tighter variant for the UNTRACKED scan. Same set minus whitespace: an
 * untracked file with a space in its name is ordinary (downloads, OS scratch),
 * whereas one containing a paren/quote/backtick/bang is not. Every stray this
 * repo has actually seen matches this or is caught by the zero-byte signal.
 */
const UNTRACKED_FRAGMENT = /[()!;&|'"`]/;

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

// ── Working-tree scan (untracked). WARN only — never fails the build. ──
// `-z` keeps odd filenames intact; `--porcelain` records are "XY <path>\0".
// Untracked entries are "?? ". Directories arrive with a trailing slash and
// are skipped — only the files inside one could be strays, and git collapses
// them, so a stray in a new dir is out of scope here (the index gate covers it).
const warnings = [];
try {
  const status = execFileSync('git', ['status', '--porcelain', '-z'], {
    encoding: 'utf8',
  });
  for (const record of status.split('\0')) {
    if (!record.startsWith('?? ')) continue;
    const path = record.slice(3);
    if (!path || path.endsWith('/')) continue;
    const basename = path.split('/').pop();
    if (EMPTY_ALLOWLIST.has(basename)) continue;

    const fragment = UNTRACKED_FRAGMENT.test(basename);
    let empty = false;
    try {
      const st = statSync(path);
      empty = st.isFile() && st.size === 0;
    } catch {
      continue; // vanished between status and stat — nothing to report
    }

    if (fragment || empty) {
      const why = fragment && empty
        ? 'zero-byte + shell-fragment name'
        : fragment
          ? 'shell-fragment name'
          : 'zero-byte';
      warnings.push(`${JSON.stringify(path)} (${why})`);
    }
  }
} catch {
  // Not a git work tree, or git unavailable — the index gate above already
  // ran and is the authoritative signal. Never let the advisory scan throw.
}

if (warnings.length > 0) {
  console.warn('check-stray-files: WARNING — possible stray artifacts in the working tree:\n');
  for (const w of warnings) console.warn(`  - ${w}`);
  console.warn(
    '\nThese are UNTRACKED, so this is advisory only and does not fail the build.',
  );
  console.warn(
    'They look like shell-redirection artifacts (unquoted `=>` reaching bash).',
  );
  console.warn(
    'Delete them before your next `git add -A`, or they become a CI failure.\n',
  );
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
