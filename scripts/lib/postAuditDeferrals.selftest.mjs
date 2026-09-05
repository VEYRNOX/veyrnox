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

// 7. The dangerous branch — CHANGED 2026-09-05, and the inversion is the fix.
//
//    This block used to assert these all return 0, on the reasoning that
//    run-post-audit-qa.mjs maxes them against the static count. It pinned the
//    defect: `Math.max(0, 0)` is 0, so a skip with NO static marker — a runtime
//    `test.skip(cond)`, a serial describe skipping after a failure, a project
//    grep filter — in a run whose report never landed produced "0 deferred" and
//    the gate printed full coverage having read nothing.
//
//    "No evidence" is now null, distinct from "zero skips", and the caller
//    blocks its verdict on it. Do not soften these back to 0: the whole gate
//    rests on the two being distinguishable.
{
  check('playwright: missing file returns null', readPlaywrightSkipped(path.join(dir, 'nope.json')) === null);
  check('vitest: missing file returns null', readVitestSkipped(path.join(dir, 'nope.json')) === null);
  check('playwright: malformed json returns null', readPlaywrightSkipped(fixture('bad.json', '{')) === null);
  check('playwright: no stats key returns null', readPlaywrightSkipped(fixture('nostats.json', '{}')) === null);
  check('playwright: stats without skipped returns null', readPlaywrightSkipped(fixture('nostatskip.json', JSON.stringify({ stats: { expected: 4 } }))) === null);
  check('vitest: report with neither count key returns null', readVitestSkipped(fixture('vinone.json', '{}')) === null);

  // A REAL zero must still be a zero — otherwise the fix blocks every clean run
  // and someone reverts the whole thing.
  check('playwright: genuine 0 skips is 0, not null', readPlaywrightSkipped(fixture('pwzero.json', JSON.stringify({ stats: { expected: 4, skipped: 0 } }))) === 0);
  check('vitest: genuine 0 skips is 0, not null', readVitestSkipped(fixture('vizero.json', JSON.stringify({ numPendingTests: 0, numTodoTests: 0 }))) === 0);

  // The coercion trap the caller must avoid, pinned here because it is the
  // exact line that would silently restore the bug.
  check('Math.max(n, null) coerces null to 0 — callers must use ?? and record the gap',
    Math.max(3, null) === 3 && Math.max(0, null) === 0);
}

if (fail > 0) {
  console.error(`\npost-audit deferral counters self-test: ${fail} FAILED`);
  process.exit(1);
}
console.log('\npost-audit deferral counters self-test: all passed');
