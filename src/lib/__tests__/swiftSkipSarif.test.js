import { describe, it, expect } from 'vitest';
import { buildSarif } from '../../../scripts/build-swift-skip-sarif.mjs';

// This test guards ONE property above all: the skip-path SARIF must never claim
// that the Swift analysis succeeded.
//
// The whole reason this file exists is that the difference between
//   executionSuccessful: false  ("CodeQL did not analyse Swift")
// and
//   executionSuccessful: true   ("CodeQL analysed Swift and found nothing")
// is the difference between an honest gap and fake security (I4, and CLAUDE.md's
// "never mock a security control to look real"). Flipping that boolean would
// silently make every unscanned PR look clean, with no other visible change.
//
// It lives under src/ deliberately: vitest.config.js only includes
// 'src/**/*.test.{js,jsx}', so a test placed next to the script in scripts/
// would never run (scripts/audit/lib/source-scan.test.mjs is orphaned that way).
// A guard nothing executes is how this repo has lost checks before — see the
// #1310 -> #1313 debug-cert regression.

describe('swift skip SARIF', () => {
  it('never reports the skipped analysis as a successful run', () => {
    const invocation = buildSarif({ commitSha: 'abc123' }).runs[0].invocations[0];
    expect(invocation.executionSuccessful).toBe(false);
  });

  it('claims no findings, because none were looked for', () => {
    expect(buildSarif({ commitSha: 'abc123' }).runs[0].results).toEqual([]);
  });

  it('explains the gap in the security data itself', () => {
    const [notification] =
      buildSarif({ commitSha: 'abc123' }).runs[0].invocations[0].toolExecutionNotifications;

    expect(notification.level).toBe('warning');
    expect(notification.descriptor.id).toBe('swift-analysis-skipped');
    // The text must say Swift was NOT analysed — a blank or vague message would
    // satisfy the ruleset while telling a reader nothing.
    expect(notification.message.text).toMatch(/NOT analysed/i);
    expect(notification.message.text.length).toBeGreaterThan(80);
  });

  it('is tagged to the swift category so it lands as that language', () => {
    const run = buildSarif({ commitSha: 'abc123' }).runs[0];
    expect(run.automationDetails.id).toBe('/language:swift');
    expect(run.tool.driver.name).toBe('CodeQL');
  });

  it('is valid SARIF 2.1.0 with exactly one run', () => {
    const sarif = buildSarif({ commitSha: 'abc123' });
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(() => JSON.parse(JSON.stringify(sarif))).not.toThrow();
  });

  it('omits provenance entirely rather than inventing a placeholder sha', () => {
    // Asserting a fake revisionId would be a small lie in the one file whose
    // entire purpose is not lying.
    expect(buildSarif({}).runs[0].versionControlProvenance).toBeUndefined();

    const withSha = buildSarif({ commitSha: 'deadbeef', refName: 'refs/pull/1/merge' });
    expect(withSha.runs[0].versionControlProvenance[0]).toMatchObject({
      revisionId: 'deadbeef',
      branch: 'refs/pull/1/merge',
    });
  });

  it('includes the run URL when given one, and stays coherent without it', () => {
    const text = (sarif) =>
      sarif.runs[0].invocations[0].toolExecutionNotifications[0].message.text;

    expect(text(buildSarif({ runUrl: 'https://example/run/7' }))).toContain('https://example/run/7');
    expect(text(buildSarif({}))).not.toContain('undefined');
    expect(text(buildSarif({}))).toMatch(/NOT analysed/i);
  });
});
