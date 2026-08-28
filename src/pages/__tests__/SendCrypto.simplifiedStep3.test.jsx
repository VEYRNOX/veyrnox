// Structural pin for wizard step 3 (SIGN) after the progressive-disclosure
// refactor (2026-08-28). Fee moves to a compact row that opens FeeSheet;
// Digital Shield row becomes a full-width first-class row ABOVE the CTA.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

function step3() {
  return src.split('{step === "confirm" && (')[1] || '';
}

describe('SendCrypto — step 3 simplified', () => {
  it('renders the Network fee as a compact row that opens FeeSheet', () => {
    expect(src).toContain('FeeSheet');
    const s3 = step3();
    expect(s3).toMatch(/data-testid="fee-row"/);
    expect(s3).toMatch(/setFeeSheetOpen\(true\)/);
  });

  it('renders the Digital Shield row above the CTA on step 3', () => {
    const s3 = step3();
    const dsIdx = s3.indexOf('data-testid="digital-shield-row"');
    // The CTA IIFE contains "Prepare Digital Shield QR" or "confirm_send".
    const ctaIdx = s3.indexOf('Prepare Digital Shield QR');
    expect(dsIdx).toBeGreaterThan(-1);
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(dsIdx).toBeLessThan(ctaIdx);
  });

  it('keeps the CTA text flip based on useDigitalShieldMode', () => {
    const s3 = step3();
    expect(s3).toMatch(/useDigitalShieldMode \? 'Prepare Digital Shield QR' : tw\("send\.buttons\.confirm_send"\)/);
  });

  it('preserves the four blockedBy* composite gates on the Confirm & Send button', () => {
    const s3 = step3();
    expect(s3).toContain('blockedByApproval');
    expect(s3).toContain('blockedByRisk');
    expect(s3).toContain('blockedByRaspBio');
    expect(s3).toContain('blockedByBtcRisk');
  });

  it('keeps the "Import it first on Hardware Wallet" hint on the on state', () => {
    const s3 = step3();
    expect(s3).toContain('Import it first on Hardware Wallet');
  });

  it('goes Back to step 2 (review), not step 1, on the confirm-step Back button', () => {
    const s3 = step3();
    expect(s3).toMatch(/setStep\("review"\)/);
  });
});
