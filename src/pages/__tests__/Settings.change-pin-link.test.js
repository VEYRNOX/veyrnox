// Settings — Change PIN entry point.
//
// The Security Settings page must offer a direct route to change the vault
// credential (the owner asked for a "Change PIN" in Security Settings). The
// action itself lives on /wallet-access; Settings just links to it. Source-scan
// (mirrors rehearsalEntryPoint.test.js) — Settings.jsx pulls in base44 +
// react-query + a dozen child components, so a full render is disproportionate
// for verifying one nav row.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const settingsCode = read('../Settings.jsx');

describe('Settings — Change PIN entry point', () => {
  it('links to the Access & Recovery page (/wallet-access)', () => {
    expect(settingsCode).toMatch(/to=["']\/wallet-access["']/);
  });

  it('carries the change-pin-link test hook', () => {
    expect(settingsCode).toMatch(/data-testid=["']change-pin-link["']/);
  });

  it('labels the row for the auth cohort (PIN vs password)', () => {
    // isPin drives the label — "Change PIN" for the PIN cohort, the password
    // wording as the legacy fallback.
    expect(settingsCode).toMatch(/getAuthModel\(\)\s*===\s*["']pin["']/);
    expect(settingsCode).toMatch(/Change PIN/);
    expect(settingsCode).toMatch(/Change vault password/);
  });
});
