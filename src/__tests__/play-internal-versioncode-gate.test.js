// Static contract guard for the Play internal-testing upload gate in ci.yml.
//
// A versionCode is consumed permanently by its first successful upload, but
// publish-to-play-internal runs on every main push. Without the gate below,
// every push after a bump re-attempts an already-consumed code and reds main
// — which is exactly what happened 7 runs out of 7 between the 2026-09-08
// internal->closed rename (ae514917), which was reversed back to internal on
// 2026-09-19 and the fix.
//
// This pins the gate so it cannot be dropped the way the release-cert guard
// was (#1310 added -> #1313 silently dropped -> #1325 restored -> #1338
// tested -> inert until #1386/#1391).
//
// Every assertion runs against a COMMENT-STRIPPED copy of the workflow. The
// prose above and in ci.yml quotes the strings being pinned, so a whole-file
// match would pass on the documentation alone — the absence-check failure
// CLAUDE.md records three separate instances of on 2026-09-03.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/ci.yml'),
  'utf8',
);

// Drop full-line comments only; trailing `# v8.0.1`-style pins stay put.
const code = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const GATE_IF = "if: steps.gate.outputs.upload == 'true'";

describe('publish-to-play-internal versionCode gate', () => {
  it('declares the gate step that reads both versionCodes', () => {
    expect(code).toContain('- name: Skip when this versionCode was already consumed');
    expect(code).toContain('id: gate');
    expect(code).toContain('FORCED: ${{ inputs.force_play_upload }}');
    // Parent lookup + raw contents read are what make the comparison possible.
    expect(code).toContain(".parents[0].sha");
    expect(code).toContain('sed -nE');
  });

  it('gates all three upload-path steps, not just the action itself', () => {
    // Download, verify, upload. If a future edit adds a step to this job it
    // must decide explicitly whether the gate applies — bump this number.
    expect(code.split(GATE_IF).length - 1).toBe(3);
    // The action step specifically must be gated: assert the condition sits
    // on the line right after its name, not merely somewhere in the file.
    expect(code).toMatch(
      /- name: Upload to Play internal testing track\n\s+if: steps\.gate\.outputs\.upload == 'true'/,
    );
  });

  it('fails OPEN — an unreadable versionCode attempts the upload', () => {
    // A spurious attempt is one loud red step. A spurious skip silently
    // strands a real release build off the track. Never invert this.
    expect(code).toMatch(/if \[ -z "\$now" \] \|\| \[ -z "\$prev" \]; then\n\s+echo "upload=true"/);
  });

  it('exposes force_play_upload as the escape hatch for a cancelled bump run', () => {
    expect(code).toContain('force_play_upload:');
    expect(code).toMatch(/if \[ "\$FORCED" = "true" \]; then\n\s+echo "upload=true"/);
  });

  // The track VALUE had no pin at all until 2026-09-19, which is how it moved
  // internal -> alpha -> internal three times with only comments recording it,
  // and how the job name and a step name were left saying "closed testing"
  // while uploading to internal. A mutation check confirmed the gap: flipping
  // `track: internal` back to `alpha` left every test in this file green.
  //
  // This does not forbid changing the track — it forbids changing it SILENTLY.
  // If you move it, update this pin in the same commit and say why in the job
  // header, where the track history lives.
  // `code` is the workflow with full-line comments stripped — which is what
  // makes the absence assertions below safe. Against the raw file they would
  // match the comment recording the rename, i.e. fire on their own
  // documentation. This file already solved that; use `code`, never `workflow`.
  it('uploads to the internal track, and says so consistently', () => {
    expect(code).toMatch(/^\s+track: internal$/m)
    // The wording around it must not drift back to naming a different track.
    expect(code).not.toMatch(/uploading to Play closed testing/)
    expect(code).not.toMatch(/- name: Upload to Play closed testing track/)
    expect(code).not.toMatch(/^\s+publish-to-play-closed:/m)
  })

  it('allows Play to send the track edit through its required review state', () => {
    // Google rejects changesNotSentForReview=true when this app's track is
    // configured to send changes for review. Managed publishing still keeps
    // an internal-track upload from promoting to production.
    expect(code).toMatch(/changesNotSentForReview:\s*false/);
  });
});
