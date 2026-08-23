import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/WalletEntry.jsx'), 'utf8');

describe('WalletEntry post-onboard routing', () => {
  it('does not import WalletCreatedFlash', () => {
    expect(SRC).not.toMatch(/from\s+['"]@\/components\/WalletCreatedFlash['"]/);
  });

  it('keeps the justOnboarded branch import-only', () => {
    const branchIdx = SRC.indexOf('justOnboarded && !isDeniabilityOrDemoActive()');
    expect(branchIdx).toBeGreaterThan(-1);
    const body = SRC.slice(branchIdx, branchIdx + 500);
    expect(body).toMatch(/chosenPath === "have"/);
    expect(body).toMatch(/renderImportFirstReceive/);
    expect(body).not.toMatch(/WalletCreatedFlash/);
    expect(body).not.toMatch(/personal-backup/);
  });

  it('clears fresh CREATE onboarding via effect after the dashboard path is open', () => {
    expect(SRC).toMatch(
      /Fresh CREATE onboarding should land on the dashboard immediately[\s\S]*?useEffect\(\(\) => \{\s*if \(\s*isUnlocked &&[\s\S]*?!generatedSeed &&[\s\S]*?!kekGatePending &&[\s\S]*?justOnboarded &&[\s\S]*?chosenPath === "new"[\s\S]*?\) \{\s*setJustOnboarded\(false\);[\s\S]*?\}\s*\}, \[chosenPath, generatedSeed, isUnlocked, justOnboarded, kekGatePending\]\);/
    );
  });
});
