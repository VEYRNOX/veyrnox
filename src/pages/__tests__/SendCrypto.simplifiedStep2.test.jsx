// Structural pin for wizard step 2 (WHAT'S HAPPENING) after the
// progressive-disclosure refactor (2026-08-28). The verdict card owns the
// top of the screen; TransactionIntelligencePanel drops its "Next action"
// prose; fee selection moves off this step onto step 3.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');
const tipPanelSrc = readFileSync(
  resolve(here, '../../components/TransactionIntelligencePanel.jsx'),
  'utf8'
);

describe('SendCrypto — step 2 simplified', () => {
  it('renders the RASP composite verdict card at the top of the review step', () => {
    // The composite banner ternary (rasp-owned vs tx-owned) still owns the
    // very first slot after the summary card.
    const step2 = src.split('{step === "review" && (')[1] || '';
    // First non-summary block: verdict banner.
    expect(step2).toMatch(/presign\?\.owner === 'rasp'/);
  });

  it('renders TransactionIntelligencePanel above TransactionPreview on the review step', () => {
    const step2 = src.split('{step === "review" && (')[1] || '';
    const tipIdx = step2.indexOf('<TransactionIntelligencePanel');
    const previewIdx = step2.indexOf('<TransactionPreview');
    expect(tipIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(tipIdx).toBeLessThan(previewIdx);
  });

  it('drops the "Next action:" prose block from TransactionIntelligencePanel', () => {
    // The redundant third repeat of policy.reason is gone; primaryReason +
    // Policy label carry the message on the verdict card.
    expect(tipPanelSrc).not.toContain('Next action:');
  });

  it('does not render FeeSelector on step 2 — fee moves to step 3', () => {
    const step2 = src.split('{step === "review" && (')[1]?.split('{step === "confirm" && (')[0] || '';
    expect(step2).not.toMatch(/<FeeSelector/);
  });

  it('preserves the four blockedBy* composite gates on the step-2 Continue button', () => {
    const step2 = src.split('{step === "review" && (')[1]?.split('{step === "confirm" && (')[0] || '';
    expect(step2).toContain('blockedByApproval');
    expect(step2).toContain('blockedByRisk');
    expect(step2).toContain('blockedByRaspBio');
    expect(step2).toContain('blockedByBtcRisk');
  });

  it('resets step-3 state via resetVerify() when going back to step 1', () => {
    const step2 = src.split('{step === "review" && (')[1]?.split('{step === "confirm" && (')[0] || '';
    expect(step2).toMatch(/setStep\("form"\); resetVerify\(\)/);
  });
});
