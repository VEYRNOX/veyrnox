// scripts/lib/postAuditDeferrals.selftest.mjs
//
// Standalone self-test for the post-audit deferral counters. Run:
// `npm run check:post-audit-deferrals` (also in the `pretest` chain).
//
// NOT a vitest file, and deliberately not named *.test.mjs — same reasoning as
// scripts/audit/lib/source-scan.selftest.mjs: vitest's include would collect it,
// find no describe/it, and fail the run with "No test suite found in file".
//
// Why it earns a step: these counters gate `scripts/run-post-audit-qa.mjs`, and
// they break OPEN. Every wrong answer is 0 — an unmatched marker shape, a report
// file that was never written, a parse failure — and 0 is the value that lets the
// gate pass and prints "no deferred post-audit validations". The previous regex
// scored `test.describe.skip(` as ZERO for months. Nothing failed; that is the
// problem this file exists to make loud.

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import {
  countDeferralMarkers,
  readPlaywrightSkipped,
  readVitestSkipped,
} from './postAuditDeferrals.mjs';

let fail = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { console.error(`  FAIL ${name}`); fail++; }
}

const dir = mkdtempSync(path.join(tmpdir(), 'post-audit-deferrals-'));
const fixture = (name, contents) => {
  const p = path.join(dir, name);
  writeFileSync(p, contents);
  return p;
};

// 1. The shapes the old regex already caught must keep counting.
{
  const src = "test.fixme('a', () => {});\ntest.skip('b', () => {});\n";
  check('flat: test.fixme + test.skip both counted', countDeferralMarkers(src) === 2);
}

// 2. The regression this file exists for: a skipped describe block scored ZERO
//    under `\btest\.(fixme|skip)\(`, hiding every case inside it.
{
  check(
    'describe.skip counted',
    countDeferralMarkers("test.describe.skip('group', () => {});") === 1,
  );
  check(
    'describe.fixme counted',
    countDeferralMarkers("test.describe.fixme('group', () => {});") === 1,
  );
  check(
    'describe.serial.skip counted',
    countDeferralMarkers("test.describe.serial.skip('g', () => {});") === 1,
  );
  check(
    'describe.parallel.skip counted',
    countDeferralMarkers("test.describe.parallel.skip('g', () => {});") === 1,
  );
}

// 3. `.only` defers every case it does not name. forbidOnly catches it when
//    CI=true; this script also runs locally, where nothing does.
{
  check('test.only counted', countDeferralMarkers("test.only('a', () => {});") === 1);
  check(
    'describe.only counted',
    countDeferralMarkers("test.describe.only('g', () => {});") === 1,
  );
}

// 4. A comment or string mentioning a marker is NOT a deferral. Without the
//    comment strip, the note explaining why a skip was removed re-fails the gate.
{
  const src = [
    "// removed test.skip('a') on 2026-09-04, see #2275",
    "const msg = \"test.fixme('b') is banned here\";",
    "test('real case', () => {});",
  ].join('\n');
  check('comment + string markers not counted', countDeferralMarkers(src) === 0);
}

// 5. A clean spec counts zero — the counter must not fire on ordinary source.
{
  const src = "test('a', () => {});\ntest.describe('g', () => { test('b', () => {}); });\n";
  check('clean spec counts zero', countDeferralMarkers(src) === 0);
}

// 6. Runtime readers: real shapes parse.
{
  const pw = fixture('pw.json', JSON.stringify({ stats: { expected: 4, skipped: 3 } }));
  check('playwright: stats.skipped read', readPlaywrightSkipped(pw) === 3);

  const vi = fixture('vi.json', JSON.stringify({ numPendingTests: 2, numTodoTests: 1 }));
  check('vitest: pending + todo summed', readVitestSkipped(vi) === 3);
}

// 7. The dangerous branch. Absent, empty and malformed files all return 0 — which
//    is why run-post-audit-qa.mjs maxes these against the static count instead of
//    trusting them. Pinned so nobody "simplifies" the fallback into a throw, or
//    reads these zeros as evidence of a clean run.
{
  check('playwright: missing file returns 0', readPlaywrightSkipped(path.join(dir, 'nope.json')) === 0);
  check('vitest: missing file returns 0', readVitestSkipped(path.join(dir, 'nope.json')) === 0);
  check('playwright: malformed json returns 0', readPlaywrightSkipped(fixture('bad.json', '{')) === 0);
  check('playwright: no stats key returns 0', readPlaywrightSkipped(fixture('nostats.json', '{}')) === 0);
}

if (fail > 0) {
  console.error(`\npost-audit deferral counters self-test: ${fail} FAILED`);
  process.exit(1);
}
console.log('\npost-audit deferral counters self-test: all passed');
