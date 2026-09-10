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

  it('bounds the client-side title scan with server-side filters and a sized window (#2496)', () => {
    // Server-side `--branch` + `--event` narrow `gh run list` to runs that
    // could plausibly be this gate's target, so the client-side
    // `displayTitle | contains` pass runs over a bounded, relevant set rather
    // than the most recent 40 ci.yml runs of any kind. `--limit 200` is the
    // sized floor: 100 retries × 15s = 25 min, ci.yml build ~15 min, so the
    // window covers at most ~4 runs even on a 10+ merges/day branch.
    expect(testLab).toContain('--branch "$BRANCH"');
    expect(testLab).toContain('--event "$EXPECTED_EVENT"');
    expect(testLab).toContain('--limit 200');
    expect(testLab).not.toContain('--limit 40');
  });

  it('logs "no matching run" distinctly from "still building" (#2496)', () => {
    // Previously both cases printed the same "Waiting for CI on ${SHA}" line,
    // so a fell-out-of-window timeout looked identical to CI still running
    // and only surfaced when the retry budget expired.
    expect(testLab).toContain('No ci.yml run yet matches SHA=');
    expect(testLab).toContain('Waiting for CI run ');
  });

  it('still refuses an unsuccessful run rather than testing an older APK', () => {
    // The pinning fix must not soften the artifact-provenance rule.
    expect(testLab).toContain('refusing to test another commit\'s APK.');
    expect(testLab).toContain('refusing to fall back to an older APK');
  });
});
