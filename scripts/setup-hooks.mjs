#!/usr/bin/env node
// Points git at the repo's version-controlled hooks directory.
//
// `.git/hooks` cannot be committed, so a hook placed there protects exactly one
// clone and is invisible to review. `.githooks/` is tracked; this script wires
// `core.hooksPath` to it. Idempotent — safe to run repeatedly.
//
// Run: `node scripts/setup-hooks.mjs` (or `npm run hooks:install`).
//
// Not wired into `postinstall` on purpose: silently rewriting a contributor's
// git config on `npm install` is unfriendly, and CI does not need hooks (it runs
// `npm run check:strays` directly).

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DESIRED = '.githooks';

if (!existsSync(DESIRED)) {
  console.error(`setup-hooks: ${DESIRED}/ not found — run from the repo root.`);
  process.exit(1);
}

let current = null;
try {
  current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // Unset — `git config --get` exits 1 when the key is absent.
}

// A WORKTREE-scoped core.hooksPath silently overrides the local one (worktree
// scope wins), so setting local alone leaves hooks dead. This repo has
// `extensions.worktreeConfig=true` and Claude Code's worktree tooling writes an
// absolute `.git/hooks` override into .git/config.worktree — which is an empty
// directory, so the net effect is "no hooks, silently". Clear it so the local
// value applies. Verified 2026-07-19: without this, `git config core.hooksPath`
// still reported the old path after a successful local set.
let worktreeOverride = null;
try {
  worktreeOverride = execFileSync(
    'git',
    ['config', '--worktree', '--get', 'core.hooksPath'],
    { encoding: 'utf8' },
  ).trim();
} catch {
  // No worktree-scoped value, or worktreeConfig disabled — both fine.
}

if (worktreeOverride && worktreeOverride !== DESIRED) {
  try {
    execFileSync('git', ['config', '--worktree', '--unset', 'core.hooksPath'], {
      stdio: 'ignore',
    });
    console.log(
      `setup-hooks: cleared worktree-scoped override (was ${worktreeOverride})`,
    );
  } catch {
    console.error(
      'setup-hooks: WARNING — could not clear the worktree-scoped',
      'core.hooksPath. Hooks may not run in this worktree.',
    );
  }
}

if (current === DESIRED && !worktreeOverride) {
  console.log(`setup-hooks: already configured (core.hooksPath=${DESIRED}).`);
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', DESIRED], { stdio: 'inherit' });

// Git needs the exec bit on POSIX. On Windows the working-tree bit is not
// meaningful, but the index bit matters for anyone who clones on Linux/macOS.
try {
  execFileSync('git', ['update-index', '--chmod=+x', '.githooks/pre-commit'], {
    stdio: 'ignore',
  });
} catch {
  // Not yet tracked (first run, before the file is added) — harmless.
}

console.log(`setup-hooks: core.hooksPath set to ${DESIRED}`);
if (current) console.log(`setup-hooks: previous value was ${current}`);
console.log('setup-hooks: pre-commit stray-artifact gate is now active.');
