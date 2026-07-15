// Structural pin tests — G4 clipboard RASP gate.
//
// Verifies that every sensitiveGate callsite covering clipboard/seed-reveal is
// wired in the three copy entry points:
//   1. WalletEntry.jsx      — copySeed() during onboarding seed display
//   2. WalletPortfolioPage  — SeedGrid copy button
//   3. HDWalletManager      — makeCopy factory (sensitive=true leg)
//
// TDD: these pins are written BEFORE implementation and must be RED until the
// gate is wired. They do not test runtime behaviour — that lives in unit tests
// for makeCopy.rasp.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');

const read = (rel) => readFileSync(join(root, rel), 'utf8');

// ── 1. WalletEntry.jsx — copySeed ────────────────────────────────────────────
describe('G4 clipboard — WalletEntry.jsx copySeed gate', () => {
  const src = read('components/WalletEntry.jsx');

  it('imports useRaspArtifact and sensitiveGate (already present from G4 import gate)', () => {
    expect(src).toContain("useRaspArtifact");
    expect(src).toContain("sensitiveGate");
  });

  it('copySeed calls sensitiveGate with seed-reveal before copySecret', () => {
    // Find the copySeed function and confirm it contains the gate
    const copySeedIdx = src.indexOf('const copySeed');
    expect(copySeedIdx).toBeGreaterThan(0);
    const copySeedBody = src.slice(copySeedIdx, copySeedIdx + 400);
    expect(copySeedBody).toContain("sensitiveGate(raspArtifact, 'seed-reveal')");
  });
});

// ── 2. WalletPortfolioPage.jsx — SeedGrid ────────────────────────────────────
describe('G4 clipboard — WalletPortfolioPage SeedGrid gate', () => {
  const src = read('pages/WalletPortfolioPage.jsx');

  it('imports useRaspArtifact and sensitiveGate', () => {
    expect(src).toMatch(/useRaspArtifact/);
    expect(src).toMatch(/sensitiveGate/);
  });

  it('SeedGrid calls sensitiveGate with seed-reveal before copySecret', () => {
    expect(src).toContain("sensitiveGate(raspArtifact, 'seed-reveal')");
  });
});

// ── 3. HDWalletManager.jsx — makeCopy ────────────────────────────────────────
describe('G4 clipboard — HDWalletManager makeCopy gate', () => {
  const src = read('pages/HDWalletManager.jsx');

  it('imports useRaspArtifact and sensitiveGate', () => {
    expect(src).toMatch(/useRaspArtifact/);
    expect(src).toMatch(/sensitiveGate/);
  });

  it('makeCopy accepts a raspArtifact argument', () => {
    expect(src).toMatch(/makeCopy\s*\(\s*setCopied\s*,\s*raspArtifact/);
  });

  it('makeCopy gates sensitive copies with sensitiveGate seed-reveal', () => {
    const makeIdx = src.indexOf('export function makeCopy');
    expect(makeIdx).toBeGreaterThan(0);
    const makeBody = src.slice(makeIdx, makeIdx + 500);
    expect(makeBody).toContain("sensitiveGate(raspArtifact, 'seed-reveal')");
  });
});
