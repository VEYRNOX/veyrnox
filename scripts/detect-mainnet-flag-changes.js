#!/usr/bin/env node
// Diff-based mainnet activation flag change gate.
//
// WHAT THIS IS: mainnet is already live (unlocked 2026-06-17, see
// docs/audit-triage/internal-audit-2026-06-17.md). This is NOT a "flag must be
// false" gate — it is a "flag CHANGED, so a human must look" gate. It diffs the
// current working tree (or a supplied base ref) against `main` and flags any
// line-level change to the small set of flags that gate real-funds movement.
//
// This is a PROCEDURAL gate, not a cryptographic one: it produces a machine
// readable signal (JSON on stdout, exit code) that CI wires into a PR label +
// comment. It does not and cannot block a merge by itself — see
// docs/MAINNET_GATE_DESIGN.md for the rationale.
//
// Usage:
//   node scripts/detect-mainnet-flag-changes.js               # diff HEAD vs origin/main (or main)
//   node scripts/detect-mainnet-flag-changes.js --base <ref>   # diff HEAD vs <ref>
//   git diff main..HEAD | node scripts/detect-mainnet-flag-changes.js --stdin
//
// Exit codes:
//   0 — no protected-flag changes found (also true if --stdin/diff is empty)
//   0 — protected-flag changes found (still exit 0; this is advisory, not a
//       hard CI failure — the CALLER decides whether to fail/label/comment)
//   1 — could not compute a diff at all (git error) — fails closed so a
//       silent no-signal isn't mistaken for "no changes"
//
// Output: always a single JSON object on stdout:
//   { "hasMainnetChanges": boolean, "changes": [ { flag, file, oldValue, newValue, lineNumber } ] }

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ---- Protected flags -------------------------------------------------------
// Master switches (one line each, single source of truth per chain family).
const MASTER_FLAGS = ['ALLOW_MAINNET', 'ALLOW_BTC_MAINNET', 'ALLOW_SOL_MAINNET'];

// Files where a per-network `enabled` / `isTestnet` flip is meaningful. Kept as
// an explicit allowlist (rather than "any file") so unrelated `enabled:` /
// `isTestnet:` tokens elsewhere in the tree (tests, mocks, unrelated config)
// don't create noise.
const NETWORK_REGISTRY_FILES = [
  'src/wallet-core/evm/networks.js',
  'src/wallet-core/btc/networks.js',
  'src/wallet-core/sol/networks.js',
  'src/wallet-core/assets.js',
];

function isNetworkRegistryFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^a\/|^b\//, '');
  return NETWORK_REGISTRY_FILES.some((f) => normalized === f || normalized.endsWith('/' + f));
}

// ---- Diff acquisition -------------------------------------------------------

function getDiffFromGit(baseRef) {
  const candidates = baseRef
    ? [baseRef]
    : ['origin/main', 'main'];

  let lastErr = null;
  for (const ref of candidates) {
    try {
      // -U0: zero context lines — every line in the diff is an actual change,
      // which keeps line-number bookkeeping exact and unambiguous below.
      // execFileSync (no shell, argv array) — ref/paths never pass through a
      // shell string, so there is no interpolation/injection surface even if
      // `--base` is ever fed a value that traces back to PR-controlled input.
      const out = execFileSync(
        'git',
        ['diff', '-U0', `${ref}...HEAD`, '--', ...NETWORK_REGISTRY_FILES],
        {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      return out;
    } catch (err) {
      lastErr = err;
      // Try the next candidate ref (e.g. no `origin/main` in a local checkout).
      continue;
    }
  }
  throw lastErr || new Error('git diff failed against all candidate base refs');
}

function readStdinSync() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// ---- Unified diff parsing ---------------------------------------------------
// Parses a `-U0` unified diff into per-file hunks of removed/added lines with
// their line numbers, so we can pair up "old value" / "new value" for a flag
// that changed on the same logical line.

function parseUnifiedDiff(diffText) {
  const files = [];
  let current = null;
  let newLineCursor = 0;
  let oldLineCursor = 0;

  const lines = diffText.split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      current = { file: null, hunks: [] };
      continue;
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      current.file = path === '/dev/null' ? current.file : path.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('--- ')) {
      // Fallback if +++ is /dev/null (file deleted) — not expected for our
      // registry files, but keep file identity from --- in that edge case.
      if (!current.file) {
        const path = line.slice(4).trim();
        current.file = path === '/dev/null' ? current.file : path.replace(/^a\//, '');
      }
      continue;
    }
    if (line.startsWith('@@ ')) {
      // @@ -oldStart[,oldLines] +newStart[,newLines] @@
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) {
        oldLineCursor = parseInt(m[1], 10);
        newLineCursor = parseInt(m[2], 10);
      }
      current.hunks.push({ removed: [], added: [] });
      continue;
    }
    if (!current || current.hunks.length === 0) continue;
    const hunk = current.hunks[current.hunks.length - 1];
    if (line.startsWith('-') && !line.startsWith('---')) {
      hunk.removed.push({ text: line.slice(1), lineNumber: oldLineCursor });
      oldLineCursor += 1;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      hunk.added.push({ text: line.slice(1), lineNumber: newLineCursor });
      newLineCursor += 1;
      continue;
    }
    // Context line (shouldn't occur with -U0, but handle defensively).
    oldLineCursor += 1;
    newLineCursor += 1;
  }
  if (current) files.push(current);
  return files.filter((f) => f.file);
}

// ---- Flag extraction ---------------------------------------------------

function extractMasterFlagValue(text, flagName) {
  const re = new RegExp(`\\b${flagName}\\s*=\\s*(true|false)\\b`);
  const m = re.exec(text);
  return m ? m[1] : null;
}

function extractKeyValue(text, key) {
  // Matches `enabled: true` / `isTestnet: false` etc. (object-literal style).
  const re = new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`);
  const m = re.exec(text);
  return m ? m[1] : null;
}

/**
 * Finds the nearest preceding `key: 'value'` or `key: "value"` in a hunk's
 * removed/added lines, to label WHICH network entry a bare `enabled:` /
 * `isTestnet:` line belongs to. This is best-effort context, not required for
 * correctness — the file + line number is the authoritative locator.
 */
function findNearestEntryKey(linesBeforeIndex) {
  for (let i = linesBeforeIndex.length - 1; i >= 0; i -= 1) {
    const m = /^\s*key:\s*['"]([\w-]+)['"]/.exec(linesBeforeIndex[i].text);
    if (m) return m[1];
  }
  return null;
}

function detectChanges(diffFiles) {
  const changes = [];

  for (const fileEntry of diffFiles) {
    const { file, hunks } = fileEntry;
    if (!isNetworkRegistryFile(file)) continue;

    for (const hunk of hunks) {
      // Pair removed[i] with added[i] where possible (same logical line
      // changing value); fall back to reporting one-sided add/remove.
      const maxLen = Math.max(hunk.removed.length, hunk.added.length);
      for (let i = 0; i < maxLen; i += 1) {
        const removedLine = hunk.removed[i];
        const addedLine = hunk.added[i];

        for (const masterFlag of MASTER_FLAGS) {
          const oldVal = removedLine ? extractMasterFlagValue(removedLine.text, masterFlag) : null;
          const newVal = addedLine ? extractMasterFlagValue(addedLine.text, masterFlag) : null;
          if (oldVal !== null || newVal !== null) {
            if (oldVal !== newVal) {
              changes.push({
                flag: masterFlag,
                file,
                oldValue: oldVal,
                newValue: newVal,
                lineNumber: addedLine ? addedLine.lineNumber : removedLine.lineNumber,
              });
            }
          }
        }

        for (const key of ['enabled', 'isTestnet']) {
          const oldVal = removedLine ? extractKeyValue(removedLine.text, key) : null;
          const newVal = addedLine ? extractKeyValue(addedLine.text, key) : null;
          if ((oldVal !== null || newVal !== null) && oldVal !== newVal) {
            const entryKey = findNearestEntryKey(hunk.removed.slice(0, i))
              || findNearestEntryKey(hunk.added.slice(0, i));
            changes.push({
              flag: entryKey ? `${key} (${entryKey})` : key,
              file,
              oldValue: oldVal,
              newValue: newVal,
              lineNumber: addedLine ? addedLine.lineNumber : removedLine.lineNumber,
            });
          }
        }
      }
    }
  }

  return changes;
}

// ---- Main -------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const baseIdx = args.indexOf('--base');
  const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : null;

  let diffText;
  try {
    diffText = useStdin ? readStdinSync() : getDiffFromGit(baseRef);
  } catch (err) {
    console.error(`detect-mainnet-flag-changes: could not compute diff — ${err.message}`);
    // Fail closed: emit a JSON error marker AND exit 1, so a CI caller can
    // distinguish "ran, found nothing" from "couldn't run at all".
    console.log(JSON.stringify({ hasMainnetChanges: false, changes: [], error: err.message }));
    process.exit(1);
  }

  const diffFiles = parseUnifiedDiff(diffText || '');
  const changes = detectChanges(diffFiles);

  const result = {
    hasMainnetChanges: changes.length > 0,
    changes,
  };

  console.log(JSON.stringify(result, null, 2));

  // Exit 0 either way — this script only DETECTS and reports; the CI workflow
  // step decides what to do with a positive result (label/comment/fail).
  process.exit(0);
}

main();
