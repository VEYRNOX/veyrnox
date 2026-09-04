// scripts/lib/postAuditDeferrals.mjs
//
// Deferral counting for the post-audit QA gate (scripts/run-post-audit-qa.mjs).
// Extracted here so the counting logic has a self-test — see
// postAuditDeferrals.selftest.mjs, wired into `pretest`. A gate whose counting is
// wrong reports 0 deferrals, which is the answer that lets the gate pass, so this
// breaks OPEN when it breaks.
//
// Two independent sources, deliberately. Neither is a superset of the other:
//
//   STATIC  — markers a regex can see in the spec source. Survives a run that
//             crashed before writing a report, where the runtime count is 0.
//   RUNTIME — the counts a test runner reports. Sees a case skipped at runtime
//             (`test.skip(cond)`), which leaves no static marker at all.
//
// The caller takes the LARGER of the two per spec. Either one alone reads 0 in a
// case the other catches.

import { readFileSync } from 'fs';

import { stripCommentsAndStrings } from '../audit/lib/source-scan.mjs';

// Every form that defers a Playwright case. Previously `\btest\.(fixme|skip)\(`,
// which matched only the two flattest shapes:
//
//   - `test.describe.skip(` / `test.describe.fixme(` scored ZERO, so an entire
//     skipped describe block — any number of deferred cases — was invisible.
//     `test.describe.serial.skip(` and `.parallel.skip(` are the same hole.
//   - `test.only(` / `test.describe.only(` defers every case it does not name.
//     Playwright's own `forbidOnly` catches this, but only when CI=true; run this
//     script locally and `.only` silently drops the rest of the file.
export const DEFERRAL_RE =
  /\btest\.(?:describe\.(?:serial\.|parallel\.)?)?(?:fixme|skip|only)\(/g;

// Comments and string literals are stripped first. Without that, a comment
// EXPLAINING why a `test.skip` was removed counts as a deferral and fails the
// gate — the "absence check fires on its own documentation" failure recorded in
// CLAUDE.md. Reuses the shared audit scanner rather than a second stripper.
export function countDeferralMarkers(source) {
  return (stripCommentsAndStrings(source).match(DEFERRAL_RE) || []).length;
}

// Both readers return 0 for an absent or unparseable file. That is NOT "clean" —
// it is "no runtime evidence", which is exactly why the caller maxes it against
// the static count instead of trusting it alone.
function readJson(jsonPath, pick) {
  try {
    return pick(JSON.parse(readFileSync(jsonPath, 'utf8'))) || 0;
  } catch {
    return 0;
  }
}

// vitest's JSON reporter: pending (`.skip`) and todo cases both mean not run.
export function readVitestSkipped(jsonPath) {
  return readJson(jsonPath, (raw) => (raw.numPendingTests || 0) + (raw.numTodoTests || 0));
}

// Playwright's JSON reporter. `stats.skipped` covers `test.skip`, `test.fixme`
// and every case inside a skipped describe — the shapes the regex above had to
// be widened to see statically.
export function readPlaywrightSkipped(jsonPath) {
  return readJson(jsonPath, (raw) => (raw && raw.stats && raw.stats.skipped) || 0);
}
