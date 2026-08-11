// WalletEntry post-onboard branch swap (Slice G+H plan §4).
//
// Source-level test rather than a full mount: WalletEntry pulls the full
// vault / KEK / router / RASP tree. Same pattern as
// FirstRunTour.placement.test.js — pin the branch itself in the source.
//
// The plan requires (line ~1227) the CREATE post-onboard branch to render
// <WalletCreatedFlash> instead of <FirstReceiveCardWithTelemetry>, and IMPORT
// to continue rendering FirstReceiveCard. CTA handlers must clear
// justOnboarded so the branch doesn't intercept forever.
//
// RED phase: WalletEntry.jsx still renders <FirstReceiveCardWithTelemetry> in
// this branch and does not import WalletCreatedFlash / backupNag.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/WalletEntry.jsx'), 'utf8');

describe('WalletEntry — CREATE post-onboard renders WalletCreatedFlash', () => {
  it('imports WalletCreatedFlash', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/WalletCreatedFlash['"]/);
  });

  it('imports backupNag', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/backupNag['"]/);
  });

  it('CREATE post-onboard branch renders <WalletCreatedFlash>, not FirstReceiveCardWithTelemetry', () => {
    const branchIdx = SRC.indexOf('justOnboarded && !isDeniabilityOrDemoActive()');
    expect(branchIdx).toBeGreaterThan(-1);
    const body = SRC.slice(branchIdx, branchIdx + 900);
    expect(body).toMatch(/<WalletCreatedFlash\b/);
    expect(body).not.toMatch(/<FirstReceiveCardWithTelemetry\b/);
  });

  it('IMPORT branch still renders FirstReceiveCard (unchanged)', () => {
    // FirstReceiveCard still imported and referenced somewhere in the file.
    expect(SRC).toMatch(/FirstReceiveCard/);
  });

  it('primary CTA handler clears justOnboarded, calls markBackupNagShown, and navigates to /personal-backup', () => {
    // The handler is expressed inline on the WalletCreatedFlash render.
    const flashIdx = SRC.indexOf('<WalletCreatedFlash');
    expect(flashIdx).toBeGreaterThan(-1);
    const jsx = SRC.slice(flashIdx, flashIdx + 800);
    expect(jsx).toMatch(/onPrimary\s*=/);
    expect(jsx).toMatch(/setJustOnboarded\s*\(\s*false\s*\)/);
    expect(jsx).toMatch(/markBackupNagShown\s*\(/);
    expect(jsx).toMatch(/\/personal-backup/);
  });

  it('secondary CTA handler clears justOnboarded and calls dismissForSession', () => {
    const flashIdx = SRC.indexOf('<WalletCreatedFlash');
    expect(flashIdx).toBeGreaterThan(-1);
    const jsx = SRC.slice(flashIdx, flashIdx + 800);
    expect(jsx).toMatch(/onDismiss\s*=/);
    expect(jsx).toMatch(/setJustOnboarded\s*\(\s*false\s*\)/);
    expect(jsx).toMatch(/dismissForSession\s*\(/);
  });
});
