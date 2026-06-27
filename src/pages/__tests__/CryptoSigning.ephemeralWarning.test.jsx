// @ts-nocheck
// H-B: Source-scan test for the persistent ephemeral-key warning banner.
//
// CryptoSigning.jsx has deep native deps (ethers, RASP, sign-gate) that are
// expensive to mock for a render test. The properties we need to assert are
// static markup constraints — present in the source text — so a source scan is
// the lightest, most reliable approach. This mirrors the pattern used by other
// source-scan tests in this codebase (e.g. ColdSign.h11.test.js).
//
// Assertions:
//   1. Banner text includes "temporary" or "not saved" — communicates ephemeral nature.
//   2. Banner text includes "private key" or "export" — communicates recovery requirement.
//   3. No dismiss/close button inside the banner — it is not dismissible.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', 'CryptoSigning.jsx'), 'utf-8');

// Extract the banner block. The banner is delimited by its H-B comment and ends
// before the tab-bar div. We grab everything between those two markers.
const bannerStart = src.indexOf('H-B: Persistent ephemeral-key warning');
const bannerEnd   = src.indexOf('H-B: Persistent ephemeral-key warning') > -1
  ? src.indexOf('</div>', src.indexOf('</div>', bannerStart) + 1) + 6  // closing tag of the outer <div>
  : -1;
const bannerBlock = bannerStart > -1 ? src.slice(bannerStart, bannerEnd) : '';

describe('CryptoSigning ephemeral-key warning banner (H-B)', () => {
  it('banner block is present in the source', () => {
    expect(bannerBlock.length).toBeGreaterThan(0);
  });

  it('communicates that keys are temporary or not saved', () => {
    const lower = bannerBlock.toLowerCase();
    expect(lower.includes('temporary') || lower.includes('not saved')).toBe(true);
  });

  it('communicates the need to export or save the private key', () => {
    const lower = bannerBlock.toLowerCase();
    expect(lower.includes('private key') || lower.includes('export')).toBe(true);
  });

  it('does not contain a dismiss or close button element', () => {
    // A close/dismiss button would appear as a <button> or <Button> element whose
    // aria-label or onClick references "close" or "dismiss". The banner must be
    // non-dismissible — no interactive close control should exist inside it.
    // We look for a button/Button tag that carries a dismiss/close label.
    const hasCloseButton =
      /<[Bb]utton[^>]*(aria-label=["'][^"']*(?:close|dismiss)[^"']*["']|onClick[^>]*(?:close|dismiss))/i.test(bannerBlock);
    expect(hasCloseButton).toBe(false);
  });
});
