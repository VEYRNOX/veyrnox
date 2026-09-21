#!/usr/bin/env node
// scripts/security-diff/classify.mjs
//
// Changed-file classifier for the daily security diff.
//
// WHY. The scan's path list is organised by WHERE code lives; findings come from
// WHAT code does. Seven consecutive runs (through 2026-09-21) produced findings
// from files no path pattern matched, which is the trigger the runbook names for
// replacing prose with something mechanical. This flags each changed file by the
// CONTENT of its changed lines, so a new egress sink or decoy leak is surfaced
// wherever it lives.
//
// WHAT IT IS NOT. A flag is a reason to read the file, never a verdict. No flag
// is not a clearance either — the path index in the runbook still applies, and so
// does the behavioural triage question.
//
// TWO PASSES. Rules first match the changed (+/-) lines. Then the SINK rules
// (egress, os-state, shared-store, secret, crypto) are also matched against the
// whole new version of each changed file, reported as e.g. `os-state (file)`.
// The second pass exists because of the 2026-09-21 regression it was built to
// catch: the dormancy reminder's diff only CALLED an existing helper
// (`scheduleReminders(...)`), so `LocalNotifications` never appeared in a changed
// line and a changed-lines-only classifier missed the one finding that mattered.
//
// USAGE
//   node scripts/security-diff/classify.mjs <base> [head=origin/main]
// Prints a markdown table, flagged files first. Always exits 0 unless git fails.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Each rule: id, why it matters, and a regex tested against every changed line.
export const RULES = [
  { id: 'egress', why: 'data may leave the device (I2/I3)',
    re: /\bfetch\(|sendBeacon|XMLHttpRequest|new WebSocket|\btrackEvent\(|publishAdvisorContext|\bedgeFn\(|\brpc\(|Browser\.open|InvokeLLM/ },
  { id: 'shared-store', why: 'reads/writes state a decoy session must not see (K-2)',
    re: /base44\.entities|localStorage\.(get|set|remove)Item|sessionStorage\.|indexedDB|\bsecureSet\(|\bsecureGet\(/ },
  { id: 'os-state', why: 'OS-level state panic wipe cannot see (ALL_RESIDUE_KEYS)',
    re: /LocalNotifications|Preferences\.(set|remove)|Keychain|SecureStorage\.(set|remove)/ },
  { id: 'deniability', why: 'decoy/hidden/demo gating changed (I3)',
    re: /isDeniabilityOrDemoActive|\bisDecoy\b|\bisHidden\b|denyInDeniable|ALL_RESIDUE_KEYS|RESIDUE_KEYS|panicWipe/ },
  { id: 'gate', why: 'a security gate or step-up changed (I4)',
    re: /requireTwoFactor|runTheftProtectionGate|presignGate|evaluateSendGate|\bSEND_GATE\b|proceedAllowed|TIER\.BLOCK|useActionGuard|isSendReauthRequired/ },
  { id: 'tier-gate', why: 'a tier check that may be a security gate',
    re: /\bcurrentTier\b|\buseTier\(|TIER\.(FREE|SAFETY_PLUS|AI_SECURITY_PROTECTION)|getCachedTier|setCachedTier|SAFETY_PLUS_ROUTES/ },
  { id: 'credential-floor', why: 'how strong a credential must be',
    re: /(PIN|PASSWORD|PASSPHRASE)_?(MIN|MAX|LEN|LENGTH)\w*|minLength|\\d\{\d+,\d*\}|KDF_PARAMS|argon2/i },
  { id: 'secret', why: 'handles a credential or signing secret',
    re: /api-secret|SERVICE_ROLE|service_role|_SECRET\b|\bBearer\b|x-proxy-secret|hmac|signingSecret/i },
  { id: 'crypto', why: 'key material or crypto primitive (I1)',
    re: /@noble\/|@scure\/|mnemonic|privateKey|decryptVault|encryptVault|deriveKey|\bKEK\b|combineKek/ },
  { id: 'security-claim', why: 'user-facing security claim (I4 honesty)',
    re: /\bverified\b|guarantee|can.?t (reach|access)|never (blocks|leaves)|fully protect|stolen device|independent(ly)? audit/i },
];

// Sinks are worth flagging even when only a caller changed. The others (gate,
// deniability, tier, claims) are only meaningful when the changed lines touch them.
const FILE_LEVEL = new Set(['egress', 'os-state', 'shared-store', 'secret', 'crypto']);

const TEST_FILE = /(__tests__\/|\.test\.|\.spec\.|^e2e\/)/;
const SKIP_MARK = /\b(it|test|describe)\.(skip|fixme|todo|only)\(/g;
const ASSERTION = /\bexpect\(|\bassert[.(]/;

/**
 * Classify one file from its changed lines, plus its new content for sink rules.
 * @param {string} path
 * @param {{added: string[], removed: string[]}} lines
 * @param {string} [content]  the file at the head ref ('' if deleted/unknown)
 * @returns {{path: string, flags: string[], notes: string[]}}
 */
export function classifyFile(path, { added, removed }, content = '') {
  const changed = [...added, ...removed];
  const flags = RULES.filter((r) => changed.some((l) => r.re.test(l))).map((r) => r.id);
  for (const r of RULES) {
    if (FILE_LEVEL.has(r.id) && !flags.includes(r.id) && r.re.test(content)) {
      flags.push(`${r.id} (file)`);
    }
  }
  const notes = [];
  if (TEST_FILE.test(path)) {
    const count = (ls) => ls.reduce((n, l) => n + (l.match(SKIP_MARK)?.length ?? 0), 0);
    const skipDelta = count(added) - count(removed);
    if (skipDelta > 0) notes.push(`+${skipDelta} skip/fixme/todo/only`);
    const lostAsserts = removed.filter((l) => ASSERTION.test(l)).length
      - added.filter((l) => ASSERTION.test(l)).length;
    if (lostAsserts > 0) notes.push(`${lostAsserts} net assertion(s) removed`);
    if (notes.length) flags.push('test-weakened');
  }
  return { path, flags, notes };
}

/**
 * Split a `git diff --unified=0` into per-file changed lines.
 * @param {string} patch
 * @returns {Map<string, {added: string[], removed: string[]}>}
 */
export function parsePatch(patch) {
  const files = new Map();
  let cur = null;
  for (const line of patch.split('\n')) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) {
      cur = { added: [], removed: [] };
      files.set(m[2], cur);
      continue;
    }
    if (!cur || line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return files;
}

/** @param {ReturnType<typeof classifyFile>[]} results */
export function toMarkdown(results) {
  // Direct (changed-line) hits outrank (file) hits: they are what the diff did.
  const weight = (r) => r.flags.reduce((w, f) => w + (f.endsWith('(file)') ? 1 : 10), 0);
  const flagged = results.filter((r) => r.flags.length).sort((a, b) => weight(b) - weight(a));
  const clean = results.filter((r) => !r.flags.length);
  const out = [
    `Changed files: ${results.length} — content-flagged: ${flagged.length}`,
    '',
    '| file | flags | notes |',
    '|---|---|---|',
    ...flagged.map((r) => `| \`${r.path}\` | ${r.flags.join(', ')} | ${r.notes.join('; ')} |`),
  ];
  if (clean.length) {
    out.push('', `No content flags (${clean.length}) — still subject to the runbook's path index:`);
    out.push(clean.map((r) => `\`${r.path}\``).join(', '));
  }
  out.push('', 'Rules:', ...RULES.map((r) => `- **${r.id}** — ${r.why}`),
    '- **<rule> (file)** — the sink is in the changed file but not in its changed lines; read what the new lines call',
    '- **test-weakened** — a test file gained skip/fixme/todo/only or lost net assertions');
  return out.join('\n');
}

function main() {
  const [base, head = 'origin/main'] = process.argv.slice(2);
  if (!base) {
    console.error('usage: node scripts/security-diff/classify.mjs <base> [head=origin/main]');
    process.exit(2);
  }
  const patch = execFileSync('git', ['diff', '--no-color', '--unified=0', base, head],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const contentAt = (p) => {
    try {
      return execFileSync('git', ['show', `${head}:${p}`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return ''; } // deleted in head, or binary
  };
  const results = [...parsePatch(patch)].map(([p, l]) => classifyFile(p, l, contentAt(p)));
  console.log(toMarkdown(results));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
