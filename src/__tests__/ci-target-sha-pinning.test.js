// Static contract guard for SHA-pinned CI dispatches.
//
// `gh workflow run --ref` only accepts a branch or tag, so a dispatched ci.yml
// run's head_sha is main's tip at creation time, not the commit the caller
// asked for. On a branch merging 10+ times a day those differ constantly:
// firebase-test-lab.yml runs 34197672875 and 34328144917 both failed with a
// green CI build sitting in a run they could not identify.
//
// Two halves keep that closed, and BOTH have to stay:
//   1. ci.yml starts every consumer from the trusted event SHA, then switches
//      it to the guard's validated main-tree SHA before dependency setup.
//   2. ci.yml's run-name carries the effective SHA, so the caller can find
//      its run without head_sha.
// Half of this fix is worse than none: pinning the checkout while matching on
// head_sha still fails to find the run, and matching run-name while building
// the tip finds a run that tested the wrong commit.
//
// Assertions run against COMMENT-STRIPPED copies. Both workflows discuss the
// strings being pinned at length, so a whole-file match would pass on the
// prose alone — the absence-check failure CLAUDE.md records three instances
// of on 2026-09-03.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stripComments = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const ci = stripComments(read('.github/workflows/ci.yml'));
const testLab = stripComments(read('.github/workflows/firebase-test-lab.yml'));

const CHECKOUT = 'actions/checkout@';
const TRUSTED_REF = 'ref: ${{ github.sha }}';
const RAW_INPUT_REF = 'ref: ${{ inputs.target_sha }}';
const VALIDATED_CHECKOUT = 'git checkout --detach "$VALIDATED_SHA"';

describe('ci.yml SHA pinning', () => {
  it('accepts target_sha and validates it before anything trusts it', () => {
    expect(ci).toContain('target_sha:');
    expect(ci).toContain('target-sha-guard:');
    // A branch name would resolve and silently build the wrong tree.
    expect(ci).toContain("grep -qE '^[0-9a-f]{40}$'");
  });

  it('switches every consumer checkout to the guarded SHA before dependency setup', () => {
    // A single unpinned checkout builds the branch tip into an otherwise
    // pinned run — a mixed tree, which is worse than an honest mismatch.
    const checkouts = ci.split(CHECKOUT).length - 1;
    const trustedPins = ci.split(TRUSTED_REF).length - 1;
    const validatedCheckouts = ci.split(VALIDATED_CHECKOUT).length - 1;
    expect(checkouts).toBeGreaterThan(0);
    // The guard itself uses the event checkout to validate ancestry; every
    // consumer starts from the trusted event SHA and switches afterward.
    expect(trustedPins).toBe(checkouts - 1);
    expect(validatedCheckouts).toBe(checkouts - 1);
    expect(ci).not.toContain(RAW_INPUT_REF);
  });

  it('puts the effective SHA in the run name so a caller can find its run', () => {
    expect(ci).toContain('run-name: ci · ${{ inputs.target_sha || github.sha }}');
  });
});

describe('firebase-test-lab.yml gate', () => {
  it('dispatches ci.yml with the SHA it intends to test', () => {
    expect(testLab).toMatch(/gh workflow run ci\.yml[\s\S]{0,200}-f target_sha="\$GITHUB_SHA"/);
  });

  it('identifies the CI run by run name, never by head_sha', () => {
    expect(testLab).toContain('displayTitle | contains');
    // `--commit` filters on head_sha, which is the branch tip for a dispatch.
    expect(testLab).not.toContain('--commit "$SHA"');
  });

  it('still refuses an unsuccessful run rather than testing an older APK', () => {
    // The pinning fix must not soften the artifact-provenance rule.
    expect(testLab).toContain('refusing to test another commit\'s APK.');
    expect(testLab).toContain('refusing to fall back to an older APK');
  });
});

// publish-to-play-closed was the one consumer target_sha never reached (#2495).
// `android-release` builds the AAB from the guard's validated SHA, but this job
// read `build.gradle` at `github.sha` to decide whether the versionCode had
// moved — deciding on one tree while uploading another, which is the exact
// failure target_sha exists to remove.
//
// The two assertions below are a pair and both are load-bearing. Switching the
// SHA without adding the `needs:` entry is WORSE than not fixing it: the
// expression resolves to an empty string, `vc_at ""` returns nothing, and the
// gate takes its deliberate fail-open branch and uploads on every push.
//
// Scoped to the job block, not the whole file, for two reasons. `SHA: ${{
// github.sha }}` is a SUBSTRING of the guard's own legitimate `EVENT_SHA: ${{
// github.sha }}` at the top of ci.yml, so a file-wide absence check fires on
// correct code. And the fix's own comments quote `github.sha` as history —
// hence the comment-stripped copy, per this file's header.
describe('ci.yml publish-to-play-closed uses the validated SHA', () => {
  const start = ci.indexOf('\n  publish-to-play-closed:');
  // End at the next top-level job key, so the slice cannot spill into whatever
  // job happens to follow and satisfy an assertion from there.
  const rest = ci.slice(start + 1);
  const nextJob = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
  const job = nextJob === -1 ? rest : rest.slice(0, nextJob);

  it('locates the job block', () => {
    expect(start).toBeGreaterThan(-1);
    expect(job).toContain('Skip when this versionCode was already consumed');
  });

  it('depends on target-sha-guard so the outputs resolve', () => {
    expect(job).toMatch(/needs:\s*\[[^\]]*target-sha-guard[^\]]*\]/);
  });

  it('reads the guard output, never the branch tip', () => {
    expect(job).toContain('SHA: ${{ needs.target-sha-guard.outputs.effective_sha }}');
    expect(job).not.toContain('SHA: ${{ github.sha }}');
  });
});
