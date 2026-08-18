// WalletEntry post-onboard branch (Slice G+H, updated: Personal Backup
// prompt removed from onboarding — nudge moved to in-app BackupNagSheet).
//
// Source-level test: WalletEntry pulls the full vault / KEK / router / RASP
// tree. Same pattern as FirstRunTour.placement.test.js.
//
// CREATE branch renders <WalletCreatedFlash> with a single onDismiss that
// clears justOnboarded. No onPrimary, no /personal-backup navigation.
// IMPORT branch still renders FirstReceiveCard (unchanged).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/WalletEntry.jsx'), 'utf8');

describe('WalletEntry — CREATE post-onboard renders WalletCreatedFlash', () => {
  it('imports WalletCreatedFlash', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/WalletCreatedFlash['"]/);
  });

  it('CREATE post-onboard branch renders <WalletCreatedFlash>, not FirstReceiveCardWithTelemetry', () => {
    const branchIdx = SRC.indexOf('justOnboarded && !isDeniabilityOrDemoActive()');
    expect(branchIdx).toBeGreaterThan(-1);
    const body = SRC.slice(branchIdx, branchIdx + 900);
    expect(body).toMatch(/<WalletCreatedFlash\b/);
    expect(body).not.toMatch(/<FirstReceiveCardWithTelemetry\b/);
  });

  it('IMPORT branch still renders FirstReceiveCard (unchanged)', () => {
    expect(SRC).toMatch(/FirstReceiveCard/);
  });

  it('onDismiss clears justOnboarded', () => {
    const flashIdx = SRC.indexOf('<WalletCreatedFlash');
    expect(flashIdx).toBeGreaterThan(-1);
    const jsx = SRC.slice(flashIdx, flashIdx + 400);
    expect(jsx).toMatch(/onDismiss\s*=/);
    expect(jsx).toMatch(/setJustOnboarded\s*\(\s*false\s*\)/);
  });

  it('does NOT navigate to /personal-backup from onboarding', () => {
    const flashIdx = SRC.indexOf('<WalletCreatedFlash');
    expect(flashIdx).toBeGreaterThan(-1);
    const jsx = SRC.slice(flashIdx, flashIdx + 400);
    expect(jsx).not.toMatch(/\/personal-backup/);
  });
});
