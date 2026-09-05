// The post-audit gate must not report full coverage from a report it never read.
//
// scripts/lib/postAuditDeferrals.mjs now returns `null` for "no runtime
// evidence", distinct from `0` for "zero skips" — that contract is pinned
// behaviourally by postAuditDeferrals.selftest.mjs (wired into `pretest`).
//
// WHAT THIS FILE IS, STATED HONESTLY. It is a WIRING pin, not behavioural
// validation. run-post-audit-qa.mjs executes real Playwright and vitest suites
// end to end; there is no way to exercise its verdict from a unit test without
// running them. So these assertions read the source and check that the null is
// actually consumed and actually reaches the verdict.
//
// That is exactly the weaker class of evidence the 2026-09-03 diff (S-6)
// criticised a report for labelling "PASS", so it is labelled for what it is:
// it catches the wiring being deleted, and it does NOT prove the gate blocks on
// a real run. The behavioural half is the selftest plus the reader mutations.
//
// Comments are stripped before every assertion. The alternative — matching raw
// source — is how two pins on 2026-09-03 ended up passing against the comment
// that recorded the thing they were checking for.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GATE = resolve(process.cwd(), 'scripts/run-post-audit-qa.mjs');

/** Source with `//` line comments removed, so prose cannot satisfy a check. */
function code() {
  return readFileSync(GATE, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('post-audit gate consumes "no runtime evidence" as blocking', () => {
  it('reads a plausible gate script (guards a vacuous pass)', () => {
    // Without this, a bad path yields an empty string and every `toContain`
    // below fails loudly rather than passing — but a future refactor to
    // `not.toContain` assertions would pass silently. Assert the shape first.
    const src = code();
    expect(src.length).toBeGreaterThan(2000);
    expect(src).toContain('readPlaywrightSkipped');
    expect(src).toContain('readVitestSkipped');
  });

  it('every reader call goes through useRuntimeCount', () => {
    // The bug is one `?? 0` away from returning. If a call site reads a reader
    // directly, the null coerces and the gap is never recorded.
    const src = code();
    for (const reader of ['readPlaywrightSkipped(', 'readVitestSkipped(']) {
      const calls = [...src.matchAll(new RegExp(`\\w*\\s*\\(?\\s*${reader.replace('(', '\\(')}`, 'g'))];
      expect(calls.length, `${reader} should be called at least once`).toBeGreaterThan(0);
    }
    // Each invocation must be wrapped. Count wrapped vs total invocations.
    const totalReads = (src.match(/read(Playwright|Vitest)Skipped\(/g) || []).length;
    const wrapped = (src.match(/useRuntimeCount\([^)]*read(Playwright|Vitest)Skipped\(/g) || []).length;
    // The import line names both readers without calling them on a value, so
    // allow for it by requiring every CALL to be wrapped.
    expect(wrapped, `${wrapped}/${totalReads} reader calls wrapped in useRuntimeCount`).toBe(totalReads);
  });

  it('a missing report records a gap rather than counting zero', () => {
    const src = code();
    expect(src).toContain('runtimeEvidenceGaps');
    // The null branch must push a gap, not silently return 0.
    const fn = src.match(/function useRuntimeCount\([\s\S]*?\n\}/);
    expect(fn, 'useRuntimeCount not found').toBeTruthy();
    expect(fn[0]).toContain('=== null');
    expect(fn[0]).toContain('runtimeEvidenceGaps.push');
  });

  it('the verdict is blocked by a gap', () => {
    // The assertion that actually matters: a gap must reach both the pass/fail
    // decision and the evidence class. Mutation defence: drop
    // runtimeEvidenceComplete from either and this goes red.
    const src = code();
    const suitesPassed = src.match(/const suitesPassed = [^;]+;/);
    expect(suitesPassed, 'suitesPassed not found').toBeTruthy();
    expect(suitesPassed[0]).toContain('runtimeEvidenceComplete');

    const evidenceClass = src.match(/const evidenceClass = [\s\S]*?;/);
    expect(evidenceClass, 'evidenceClass not found').toBeTruthy();
    expect(evidenceClass[0]).toContain('runtimeEvidenceComplete');
  });

  it('runtimeEvidenceComplete is derived from the gap list, not hardcoded', () => {
    // `const runtimeEvidenceComplete = true` would satisfy every assertion
    // above while restoring the bug completely.
    const src = code();
    const decl = src.match(/const runtimeEvidenceComplete = [^;]+;/);
    expect(decl, 'runtimeEvidenceComplete not found').toBeTruthy();
    expect(decl[0]).toContain('runtimeEvidenceGaps');
    expect(decl[0]).not.toMatch(/=\s*(true|false)\s*;/);
  });
});
