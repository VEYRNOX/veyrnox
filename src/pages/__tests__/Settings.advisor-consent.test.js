// Settings — AI Security Advisor consent control.
//
// The privacy policy (§9) tells the user they can "revoke consent from
// Settings → Privacy". That sentence shipped in #2362 before any such control
// existed: lib/advisorConsent.js had setAdvisorConsent/clearAdvisorConsent and
// NOTHING called clearAdvisorConsent, while the in-panel prompt only renders
// while the stored answer is null. Once granted, there was no way back short of
// a panic wipe or clearing app storage — a promise in a legal document that no
// surface delivered.
//
// Source-scan, mirroring Settings.change-pin-link.test.js: Settings.jsx pulls in
// base44 + react-query + a dozen child components, so a full render is
// disproportionate for verifying one row and its wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const settingsCode = read('../Settings.jsx');
const enWallet = JSON.parse(read('../../i18n/locales/en/wallet.json'));

describe('Settings — AI Security Advisor consent control', () => {
  it('renders the switch the privacy policy promises', () => {
    expect(settingsCode).toMatch(/data-testid=["']advisor-consent-switch["']/);
  });

  it('imports the consent writers it needs', () => {
    expect(settingsCode).toMatch(/from\s+["']@\/lib\/advisorConsent["']/);
    expect(settingsCode).toMatch(/clearAdvisorConsent/);
  });

  // The asymmetry is the point, not an accident. Switching OFF records an
  // explicit denial and stops egress on the next call. Switching ON must NOT
  // grant: it clears the stored answer so the Advisor re-shows its disclosure
  // and the grant happens there, with the explanation in front of the user.
  // A toggle that granted directly would be consent without disclosure, which
  // is the thing §9 exists to prevent.
  it('turning it ON clears the answer rather than granting silently', () => {
    expect(settingsCode).toMatch(/if\s*\(checked\)\s*clearAdvisorConsent\(\)/);
  });

  it('turning it OFF records an explicit denial', () => {
    expect(settingsCode).toMatch(/else\s+setAdvisorConsent\(false\)/);
  });

  // A missing key renders the raw key string into the UI, which on a privacy
  // control reads as a bug and destroys the trust the control exists to earn.
  it.each(['label', 'description', 'help', 'enable_aria', 'disable_aria'])(
    'has the %s string in the en catalog', (key) => {
      expect(enWallet.settings.advisorConsent[key]).toEqual(expect.any(String));
      expect(enWallet.settings.advisorConsent[key].length).toBeGreaterThan(0);
    },
  );
});
