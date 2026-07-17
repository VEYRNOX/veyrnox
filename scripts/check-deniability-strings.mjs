#!/usr/bin/env node
// scripts/check-deniability-strings.mjs
//
// CI GUARD (Brief A — deniability-string scanner): fail the build if new
// set-count string leaks (D1–D3) or raw-seed clipboard writes creep back into
// rendered copy. This is the automated tripwire for the class of bug fixed in
// WalletPortfolioPage.jsx / StealthWallets.jsx / OnChainAnalytics.jsx /
// RiskScoring.jsx (see src/validation-sweep/__tests__/deniability-wallet-count.test.js)
// plus the "sanctioned clipboard path only" rule for raw seed material.
//
//   node scripts/check-deniability-strings.mjs
//
// Wire into package.json as "check:deniability-strings" and into CI (verify job)
// as a required step, same pattern as scripts/check-crypto-rng.mjs.
//
// No dependencies beyond Node builtins (fs, path). Pure ESM. Cross-platform
// (Windows + ubuntu CI) — no shell-outs, no OS-specific path handling beyond
// path.sep normalization for the exclusion checks below.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// CONFIG — denylist / config constants. Add future sites here.
// ---------------------------------------------------------------------------

// Directory to scan for rule class 1 (rendered-copy set-count leaks) and rule
// class 2 (raw-seed clipboard writes). Both rules run over the same tree.
export const SCAN_ROOT = 'src';
export const SCAN_EXTS = new Set(['.js', '.jsx']);

// Path fragments that exclude a file from scanning entirely (test files, the
// validation-sweep suite itself, and the rehearsal harness — these legitimately
// reference the tell strings as fixtures/spec text, not rendered copy).
// Matched against the POSIX form of the path (backslashes normalized to `/`
// first) so this list works identically on Windows and ubuntu CI.
export const EXCLUDED_PATH_FRAGMENTS_POSIX = ['__tests__', '.test.', '/rehearsal/', '/validation-sweep/'];

// Rule class 1 — identifiers that name a wallet/set-collection whose .length
// (or count-alias variable) must never be interpolated into user-facing copy.
export const SET_COLLECTION_IDENTIFIER_RE = /^(wallets?|sets?|vaults?|decoys?|unbacked|hiddenWallets?|stealthWallets?|pfWallets|evmWallets)$/i;
export const SET_COUNT_VAR_RE = /wallets?Count|setCount|vaultCount|walletCount/i;

// Non-capturing-group source fragments for splicing into composite regexes
// below (avoids capture-group-index drift from backreferences like \3/\4).
const ID_ALT = '(?:wallets?|sets?|vaults?|decoys?|unbacked|hiddenWallets?|stealthWallets?|pfWallets|evmWallets)';
const COUNT_VAR_ALT = '(?:wallets?Count|setCount|vaultCount|walletCount)';

// Rule class 2 — identifiers that name raw seed material. Any clipboard write
// whose argument expression contains one of these is a raw-seed leak unless
// it goes through the sanctioned copySensitive/copySecret helpers.
export const SEED_IDENTIFIER_RE = /mnemonic|seed(Phrase)?|recoveryPhrase|generatedSeed|savedPhrase/i;

// Files exempt from rule class 2 — the sanctioned clipboard paths. Matched by
// POSIX-normalized suffix, so this also works unchanged on Windows paths.
export const CLIPBOARD_SANCTIONED_PATHS = ['src/lib/secureClipboard.js', 'src/lib/copySecret.js'];

// ---------------------------------------------------------------------------
// Comment stripping (line-preserving) — // and /* */ only. This scanner does
// not need the full string/regex-literal awareness of scripts/audit/lib/source-scan.mjs
// because rule 1/2 both WANT to see inside string/template literals (that's
// where the leaking copy lives); we only need comments neutralized.
// ---------------------------------------------------------------------------

export function stripComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let mode = 'code'; // code | line | block | sq | dq | tpl
  const blank = (c) => (c === '\n' ? '\n' : ' ');

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += c; i++; continue; }
      if (c === '"') { mode = 'dq'; out += c; i++; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += '\n'; } else out += blank(c); i++; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; out += '  '; i += 2; } else { out += blank(c); i++; } continue; }

    // String / template states — keep content verbatim (rules need to see it),
    // just track escapes so an escaped quote doesn't end the literal early.
    if (c === '\\') { out += c; if (i + 1 < n) out += text[i + 1]; i += 2; continue; }
    if (mode === 'sq' && c === "'") { mode = 'code'; out += c; i++; continue; }
    if (mode === 'dq' && c === '"') { mode = 'code'; out += c; i++; continue; }
    if (mode === 'tpl' && c === '`') { mode = 'code'; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Line-number helper
// ---------------------------------------------------------------------------

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Rule 1a — JSX text interpolation of a wallet/set-collection count, OR a
// template-literal / string-concatenation building user-facing copy.
// ---------------------------------------------------------------------------

function findRule1aHits(strippedSrc, filename) {
  const hits = [];

  // (i) JSX text interpolation: `{<id>.length}` or `{<countVar>}` appearing as
  // a JSX child — i.e. `}` immediately followed (allowing whitespace) by JSX
  // text (a word char, a quote-less run of prose) or by another `<` (markup),
  // OR immediately preceded by JSX text / `>` (closing a tag) so it reads as
  // copy rather than a bare logic expression consumed by JS (e.g. `&&`, `?`,
  // a prop value, or a plain arithmetic expression).
  const interpRe = new RegExp(
    `\\{\\s*(${ID_ALT}\\.length|${COUNT_VAR_ALT})\\s*\\}`,
    'gi'
  );
  let m;
  while ((m = interpRe.exec(strippedSrc))) {
    const start = m.index;
    const end = start + m[0].length;
    const before = strippedSrc.slice(Math.max(0, start - 60), start);
    const after = strippedSrc.slice(end, Math.min(strippedSrc.length, end + 60));

    // Reject a prop-value assignment: `propName={` immediately before the `{`
    // (an identifier/`=` run with no intervening prose/markup text) means this
    // interpolation is a JS value, not JSX-rendered copy.
    const isPropAssignment = /[A-Za-z0-9_]=\s*$/.test(before);

    // Accept if `after` starts with word/punctuation prose (letters, a literal
    // JSX-text word like "wallets", or markup `<`) — the interpolation sits
    // directly against rendered text on its right.
    const afterIsProseOrMarkup = /^\s*[A-Za-z<]/.test(after);

    // Accept if `before` ends with prose/markup on its left: a closing tag
    // `>`, a word character (letter/quote/paren), optionally through a single
    // `(` (e.g. "visible wallets ({stealthWallets.length})") — but NOT if that
    // word-then-paren run is itself a prop assignment (handled above) or a
    // bare JS operator/keyword context (`=`, `,`, `&&`, `||`, `?`, `:`, `[`).
    const beforeTrimmed = before.trimEnd();
    const beforeEndsClosingTag = />\s*$/.test(before);
    const beforeEndsProseWord = /[A-Za-z"'”’)]\s*\(?\s*$/.test(beforeTrimmed) && !/[=,&|?:[]\s*\(?\s*$/.test(beforeTrimmed);
    const beforeIsProseOrMarkup = !isPropAssignment && (beforeEndsClosingTag || beforeEndsProseWord);

    if (!isPropAssignment && (afterIsProseOrMarkup || beforeIsProseOrMarkup)) {
      hits.push({
        file: filename,
        line: lineAt(strippedSrc, start),
        text: m[0],
        rule: 'D1a-jsx-interp',
      });
    }
  }

  // (ii) template-literal / string-concatenation building user-facing copy:
  // `${<id>.length}` or `${<countVar>}` inside a backtick template, OR string
  // concatenation `"...": ` + wallets.length (looser — flag any backtick
  // template that embeds the identifier, since template literals in this
  // codebase are copy by convention e.g. `You have ${wallets.length} wallets`).
  const tplInterpRe = new RegExp(
    `\\$\\{\\s*(${ID_ALT}\\.length|${COUNT_VAR_ALT})\\s*\\}`,
    'gi'
  );
  while ((m = tplInterpRe.exec(strippedSrc))) {
    hits.push({
      file: filename,
      line: lineAt(strippedSrc, m.index),
      text: m[0],
      rule: 'D1a-template-interp',
    });
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Rule 1b — count-driven grammatical number: ternaries testing a guarded
// identifier's .length against 1, yielding string literals (pluralization).
// ---------------------------------------------------------------------------

function findRule1bHits(strippedSrc, filename) {
  const hits = [];

  // e.g. `unbacked.length === 1 ? "" : "s"`  or  `wallets.length > 1 ? "s" : ""`
  const pluralRe = new RegExp(
    `(${ID_ALT})\\.length\\s*(===|==|>|>=)\\s*1\\s*\\?\\s*(['"\`])[^'"\`]*\\3\\s*:\\s*(['"\`])[^'"\`]*\\4`,
    'gi'
  );
  let m;
  while ((m = pluralRe.exec(strippedSrc))) {
    hits.push({
      file: filename,
      line: lineAt(strippedSrc, m.index),
      text: m[0],
      rule: 'D1b-plural-ternary',
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Rule 2 — raw seed clipboard writes.
// ---------------------------------------------------------------------------

function findRule2Hits(strippedSrc, filename) {
  const hits = [];
  if (isSanctionedClipboardPath(filename)) return hits;

  // Match `clipboard.writeText(` or `.writeText(` and capture the argument
  // expression up to the matching close-paren (handles nested parens one
  // level deep, which covers realistic call shapes like `writeText(x.trim())`).
  const callRe = /(?:clipboard\s*\.\s*writeText|\.writeText)\s*\(/g;
  let m;
  while ((m = callRe.exec(strippedSrc))) {
    const argStart = m.index + m[0].length;
    const arg = extractBalancedArg(strippedSrc, argStart);
    if (arg && SEED_IDENTIFIER_RE.test(arg)) {
      hits.push({
        file: filename,
        line: lineAt(strippedSrc, m.index),
        text: `${m[0]}${arg})`,
        rule: 'D-seed-clipboard',
      });
    }
  }
  return hits;
}

function extractBalancedArg(text, start) {
  let depth = 1;
  let i = start;
  const n = text.length;
  while (i < n && depth > 0) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
    i++;
  }
  if (depth !== 0) return null;
  return text.slice(start, i);
}

function isSanctionedClipboardPath(filename) {
  const normalized = filename.replace(/\\/g, '/');
  return CLIPBOARD_SANCTIONED_PATHS.some((p) => normalized.endsWith(p));
}

// ---------------------------------------------------------------------------
// Rule 3 — refetch()-bypasses-`enabled` in a deniability-gated useQuery.
//
// react-query v5's refetch() ignores the `enabled` option, so a component that
// gates its useQuery/useInfiniteQuery `enabled` on a deniability signal
// (isDecoy / isHidden / egressAllowed / i3Active / isDeniabilitySessionActive /
// isDeniabilityOrDemoActive) but wires an UNCONDITIONAL
// `onClick={() => refetch()}` button still lets a decoy/hidden/DEMO session
// trigger live third-party egress by tapping the button. This is the third
// occurrence of this exact bug class (PR #614 — CryptoNewsFeed/Calculator;
// PR #925; issue #1095 — GasTracker). The house fix (CryptoNewsFeed.jsx,
// GasTracker.jsx) wraps the button in the same gate variable used by
// `enabled:` — `{egressAllowed && ( <button onClick={() => refetch()}>… )}` —
// so we only flag an occurrence with NO immediately-preceding JSX conditional
// gate (`{<ident> && (`) wrapping its enclosing `<button`.
// ---------------------------------------------------------------------------

const REFETCH_ONCLICK_RE =
  /(?:onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*refetch\s*\(\s*\)\s*\}|\.onClick\s*\(\s*\(\s*\)\s*=>\s*refetch\s*\()/g;

const DENIABILITY_SIGNAL_RE =
  /isDecoy|isHidden|egressAllowed|i3Active|isDeniabilitySessionActive|isDeniabilityOrDemoActive/;

// Pre-existing instances of this exact bug class, found by rule 3 itself when
// it was added (issue #1095 session) — NOT fixed here, out of that task's
// file-ownership scope (GasTracker.jsx / this script only). Grandfathered so
// this new CI gate goes live immediately without breaking the build on
// unrelated files; each is a real un-gated `refetch()` button and should be
// fixed and removed from this list, not left here indefinitely. Do NOT add
// new entries for freshly-introduced code — this list is a one-time migration
// allowance, not a general escape hatch.
export const RULE3_LEGACY_EXEMPT_PATHS = [
  'src/pages/FeeAnalytics.jsx', // TODO(#follow-up): un-gated Retry + Refresh buttons
  'src/pages/TransactionHistory.jsx', // TODO(#follow-up): un-gated Retry + Refresh buttons
];

function isRule3LegacyExempt(filename) {
  const normalized = filename.replace(/\\/g, '/');
  return RULE3_LEGACY_EXEMPT_PATHS.some((p) => normalized.endsWith(p));
}

function isDeniabilityGatedQuery(strippedSrc) {
  if (!/use(?:Query|InfiniteQuery)\s*\(/.test(strippedSrc)) return false;
  // Look for an `enabled:` value that references a deniability signal.
  const enabledRe = /enabled\s*:\s*([^,\n}]+)/g;
  let m;
  while ((m = enabledRe.exec(strippedSrc))) {
    if (DENIABILITY_SIGNAL_RE.test(m[1])) return true;
  }
  return false;
}

// Gated iff the nearest preceding JSX conditional-render opener
// (`{<ident> && (`) is still "open" at the match position — i.e. no `)}`
// closing that same conditional appears between the opener and the match.
// Deliberately tag-name-agnostic (the house fix wraps a plain `<button>` in
// CryptoNewsFeed's Retry / GasTracker, but a `<Button>` design-system
// component elsewhere — see CryptoNewsFeed.jsx's header trigger), so this
// checks the JSX conditional structure directly rather than anchoring on any
// particular element name.
function isRefetchButtonGated(strippedSrc, matchIdx) {
  const windowStart = Math.max(0, matchIdx - 400);
  const before = strippedSrc.slice(windowStart, matchIdx);
  const gateOpenRe = /\{\s*[A-Za-z_$][\w$.]*\s*&&\s*\(/g;
  let lastOpenEnd = -1;
  let gm;
  while ((gm = gateOpenRe.exec(before))) {
    lastOpenEnd = gm.index + gm[0].length;
  }
  if (lastOpenEnd === -1) return false;
  const between = before.slice(lastOpenEnd);
  // A `)}` between the gate opener and our match means that conditional
  // already closed before reaching this button — not actually gated.
  return !/\)\s*\}/.test(between);
}

function findRule3Hits(strippedSrc, filename) {
  const hits = [];
  if (isRule3LegacyExempt(filename)) return hits;
  if (!isDeniabilityGatedQuery(strippedSrc)) return hits;

  let m;
  REFETCH_ONCLICK_RE.lastIndex = 0;
  while ((m = REFETCH_ONCLICK_RE.exec(strippedSrc))) {
    const matchIdx = m.index;
    if (!isRefetchButtonGated(strippedSrc, matchIdx)) {
      hits.push({
        file: filename,
        line: lineAt(strippedSrc, matchIdx),
        text: m[0],
        rule: 'D-refetch-egress-bypass',
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Public core matcher — pure function, unit-testable.
// ---------------------------------------------------------------------------

/**
 * Scan a single source file's contents for deniability-string leaks.
 * @param {string} source raw file contents
 * @param {string} filename path used only for reporting + clipboard-path exemption
 * @returns {Array<{file:string,line:number,text:string,rule:string}>}
 */
export function scanSource(source, filename) {
  const stripped = stripComments(source);
  return [
    ...findRule1aHits(stripped, filename),
    ...findRule1bHits(stripped, filename),
    ...findRule2Hits(stripped, filename),
    ...findRule3Hits(stripped, filename),
  ].sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// CLI wrapper — walks the tree, excludes test/rehearsal/validation-sweep
// paths, calls scanSource, reports.
// ---------------------------------------------------------------------------

function isExcludedPath(p) {
  const normalized = p.replace(/\\/g, '/');
  return EXCLUDED_PATH_FRAGMENTS_POSIX.some((frag) => normalized.includes(frag));
}

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, acc);
    else if (SCAN_EXTS.has(extname(p))) acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Self-test — a fast in-process sanity check that rule 3 (D-refetch-egress-
// bypass) actually catches the bug class it was written for, and does not
// false-positive on the already-fixed house pattern. Runs before the real
// tree scan on every `main()` invocation, so a future edit that silently
// regresses the rule (e.g. an overly-narrow regex) fails CI immediately
// instead of only being caught the next time someone introduces instance #4.
// ---------------------------------------------------------------------------

export function runSelfTest() {
  // Unconditional refetch() button in a deniability-gated component — MUST
  // be flagged (this is exactly the bug this rule exists to catch).
  const vulnerable = `
    import { useQuery } from "@tanstack/react-query";
    export default function Fixture() {
      const { refetch } = useQuery({ queryFn: fetchThing, enabled: egressAllowed });
      return (
        <button onClick={() => refetch()} aria-label="Refresh">Refresh</button>
      );
    }
  `;
  const vulnHits = scanSource(vulnerable, 'src/components/SelfTestFixture.jsx');
  assert.ok(
    vulnHits.some((h) => h.rule === 'D-refetch-egress-bypass'),
    'check-deniability-strings self-test FAILED: rule 3 did not flag an unconditional refetch() button in a deniability-gated query fixture — the D-refetch-egress-bypass check has regressed.'
  );

  // The house fix — refetch() button wrapped in the same gate variable used
  // by `enabled:` — MUST NOT be flagged (no false positive on correct code).
  const fixed = `
    import { useQuery } from "@tanstack/react-query";
    export default function Fixture() {
      const { refetch } = useQuery({ queryFn: fetchThing, enabled: egressAllowed });
      return (
        <div>
          {egressAllowed && (
            <button onClick={() => refetch()} aria-label="Refresh">Refresh</button>
          )}
        </div>
      );
    }
  `;
  const fixedHits = scanSource(fixed, 'src/components/SelfTestFixture.jsx');
  assert.ok(
    !fixedHits.some((h) => h.rule === 'D-refetch-egress-bypass'),
    'check-deniability-strings self-test FAILED: rule 3 false-positived on the gated (correct) refetch() button pattern.'
  );

  // A non-deniability-gated query's refetch() button must not be flagged —
  // this rule only applies where `enabled:` references a deniability signal.
  const unrelated = `
    import { useQuery } from "@tanstack/react-query";
    export default function Fixture() {
      const { refetch } = useQuery({ queryFn: fetchThing, enabled: true });
      return <button onClick={() => refetch()} aria-label="Refresh">Refresh</button>;
    }
  `;
  const unrelatedHits = scanSource(unrelated, 'src/components/SelfTestFixture.jsx');
  assert.ok(
    !unrelatedHits.some((h) => h.rule === 'D-refetch-egress-bypass'),
    'check-deniability-strings self-test FAILED: rule 3 flagged a refetch() button whose useQuery is not deniability-gated.'
  );
}

function main() {
  runSelfTest();

  const files = walk(SCAN_ROOT).filter((f) => !isExcludedPath(f));
  let hits = [];
  for (const f of files) {
    const source = readFileSync(f, 'utf8');
    hits = hits.concat(scanSource(source, f));
  }

  if (hits.length > 0) {
    for (const h of hits) {
      console.error(`${h.file}:${h.line}: ${h.text.trim()} [${h.rule}]`);
    }
    console.error(`\nBLOCKED: ${hits.length} deniability-string hit(s) found.`);
    process.exit(1);
  }
  console.log('OK: check-deniability-strings passed, no hits.');
}

// Only run the CLI walk when executed directly (not when imported for tests).
const isMain = process.argv[1] && (
  process.argv[1].endsWith('check-deniability-strings.mjs')
);
if (isMain) main();
