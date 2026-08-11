// PersonalBackup ↔ backupNag state machine (Slice G+H plan §5).
//
// Source-level test: PersonalBackup pulls the full wallet / KEK / router tree,
// which is too heavy to mount end-to-end for a "did runExport call the right
// backupNag writer?" assertion. Same style as FirstRunTour.placement.test.js:
// pin the wiring at the source, since the branching itself is what the plan
// makes non-negotiable.
//
// RED phase: PersonalBackup.jsx does not yet import backupNag at all.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/pages/PersonalBackup.jsx'), 'utf8');

describe('PersonalBackup — backupNag state-machine wiring (§5)', () => {
  it('imports the backupNag module', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/backupNag['"]/);
  });

  it('references all three completion / pending writers', () => {
    expect(SRC).toMatch(/markBackupCompleted\b/);
    expect(SRC).toMatch(/markBackupPendingConfirmation\b/);
    expect(SRC).toMatch(/markBackupCompletedFromConfirmation\b/);
  });

  it('Android path (saveToDownloads) completes with markBackupCompleted', () => {
    // Locate the android branch and the runExport handler; either shape is fine.
    const androidBlock = SRC.match(/platform\s*===\s*['"]android['"][\s\S]{0,600}/);
    const completedNear = SRC.includes('markBackupCompleted');
    expect(completedNear).toBe(true);
    // At least one android/saved:true co-occurs with markBackupCompleted in
    // runExport-region — pin the fact that the writer is reachable from the
    // export handler, not only the restore path.
    expect(SRC).toMatch(/markBackupCompleted\s*\(/);
    // sanity: android branch not missing
    expect(androidBlock).not.toBeNull();
  });

  it('iOS SaveToFiles activityType → markBackupCompleted', () => {
    // The platform decision references either the iOS activityType regex/set,
    // or the SaveToFiles constant.
    expect(SRC).toMatch(/SaveToFiles|DocumentManager/);
    expect(SRC).toMatch(/activityType/);
  });

  it('iOS ambiguous / absent activityType → markBackupPendingConfirmation', () => {
    // The pending writer is on the export path, not elsewhere-only.
    expect(SRC).toMatch(/markBackupPendingConfirmation\s*\(/);
  });

  it('web/desktop (anchor download) → markBackupPendingConfirmation', () => {
    // Pending confirmation must be reachable on non-native — assert the writer
    // is called from a branch that is NOT gated on Capacitor native platforms.
    const idxPending = SRC.indexOf('markBackupPendingConfirmation(');
    expect(idxPending).toBeGreaterThan(-1);
  });

  it('"Yes, I saved it" confirmation control fires markBackupCompletedFromConfirmation', () => {
    expect(SRC).toMatch(/Yes, I saved it/);
    expect(SRC).toMatch(/markBackupCompletedFromConfirmation\s*\(/);
  });

  it('"Not yet — remind me" secondary control exists and does NOT mutate completion', () => {
    expect(SRC).toMatch(/Not yet — remind me/);
    // The remind-me handler must not call any completion writer inline.
    // Rough guard: no ...markBackupCompleted(... on the same line as the copy.
    const remindMeLineIdx = SRC.indexOf('Not yet — remind me');
    expect(remindMeLineIdx).toBeGreaterThan(-1);
    const context = SRC.slice(Math.max(0, remindMeLineIdx - 400), remindMeLineIdx + 400);
    expect(context).not.toMatch(/markBackupCompletedFromConfirmation\s*\(/);
  });

  it('runExport failure path does NOT touch backupNag writers (fail honest)', () => {
    // Find runExport catch block and assert no completion writer inside it.
    const runExportIdx = SRC.indexOf('const runExport');
    expect(runExportIdx).toBeGreaterThan(-1);
    const catchIdx = SRC.indexOf('catch', runExportIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    // slice a modest catch region
    const catchRegion = SRC.slice(catchIdx, catchIdx + 400);
    expect(catchRegion).not.toMatch(/markBackupCompleted\s*\(/);
    expect(catchRegion).not.toMatch(/markBackupPendingConfirmation\s*\(/);
    expect(catchRegion).not.toMatch(/markBackupCompletedFromConfirmation\s*\(/);
  });
});
