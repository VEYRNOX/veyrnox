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

// NO EVIDENCE IS NOT ZERO. Both readers return `null` when the report is absent
// or unparseable, and a number only when they actually read one.
//
// They used to return 0 for both, on the reasoning that the caller maxes the
// runtime count against the static count. That covers a deferral BOTH sources
// can see. It does not cover the case this gate exists for: a skip with no
// static marker at all — a `test.skip(cond)` evaluated at runtime, a serial
// describe whose remaining cases are skipped after an earlier failure, a
// project `grep`/`testIgnore` filter — in a run whose report never landed.
// Static reads 0, runtime reads 0, `Math.max(0, 0)` is 0, and the gate prints
// full coverage having read nothing.
//
// `null` forces the caller to decide, and the decision it must make is to
// block: a gate cannot claim "no deferred validations" when it could not tell.
// Callers that merge with a static count must use `?? 0` explicitly and record
// the gap — `Math.max(n, null)` coerces to 0 and silently restores the bug.
function readJson(jsonPath, pick) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    return null; // absent, unreadable, or not JSON — no evidence either way
  }
  const value = pick(raw);
  return Number.isFinite(value) ? value : null;
}

// vitest's JSON reporter: pending (`.skip`) and todo cases both mean not run.
// Returns null when there is no readable report — see readJson.
export function readVitestSkipped(jsonPath) {
  return readJson(jsonPath, (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    // A report with NEITHER key is not a vitest report; treating it as 0 is the
    // same lie as treating a missing file as 0.
    if (!('numPendingTests' in raw) && !('numTodoTests' in raw)) return null;
    return (raw.numPendingTests || 0) + (raw.numTodoTests || 0);
  });
}

// Playwright's JSON reporter. `stats.skipped` covers `test.skip`, `test.fixme`
// and every case inside a skipped describe — the shapes the regex above had to
// be widened to see statically.
// Returns null when there is no readable report — see readJson.
export function readPlaywrightSkipped(jsonPath) {
  return readJson(jsonPath, (raw) => {
    // `{}` and `{stats:{}}` are not "zero skips", they are a report that does
    // not say. Only a numeric stats.skipped counts as evidence.
    const skipped = raw && raw.stats ? raw.stats.skipped : undefined;
    return Number.isFinite(skipped) ? skipped : null;
  });
}
