// Gate for the Terms / Legal reference screen brief.
//
// The brief's load-bearing constraint is that this is a STATIC reference screen,
// not an acceptance gate and not a stored-state feature: nothing is written to
// disk, so the screen reads identically in real and decoy sessions (I3) and there
// is no flag a coercer could read. These assertions enforce that, plus the
// content structure (four sections, §A/§B as marked placeholders not invented
// legal text, §C/§D honest copy present), using the same readFileSync posture as
// security-framing.test.js (there is no DOM renderer in this project).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');
const rendered = (rel) => read(rel).replace(/\s+/g, ' '); // match on-screen text, not source wrapping

const page = rendered('pages/TermsLegal.jsx');
const pageRaw = read('pages/TermsLegal.jsx');
const settings = read('pages/Settings.jsx');
const app = read('App.jsx');

describe('Terms/Legal — four sections render', () => {
  for (const heading of [
    'Terms of use',
    'Not financial advice',
    'Provisional', // §C — provisional / unaudited status
    'Honest limits', // §D — honest limits of the coercion features
  ]) {
    it(`includes the "${heading}" section`, () => {
      expect(page).toContain(heading);
    });
  }
});

describe('Terms/Legal — §A/§B are marked placeholders, not invented legal text', () => {
  it('marks the placeholder sections clearly', () => {
    // A visible marker so a reader knows this is a stub, not the terms.
    expect(page.toLowerCase()).toContain('placeholder');
    expect(page.toLowerCase()).toContain('to be supplied');
  });
  it('disclaims that the stubs are not actual terms / advice', () => {
    expect(page).toContain('not the terms of use');
    expect(page).toContain('not financial advice');
  });
});

describe('Terms/Legal — §C provisional/unaudited honest copy present', () => {
  for (const phrase of ['testnet beta', 'provisional and unaudited', 'testnet funds only']) {
    it(`states: "${phrase}"`, () => {
      expect(page).toContain(phrase);
    });
  }
});

describe('Terms/Legal — §D condensed coercion-limit reference copy present', () => {
  for (const phrase of [
    'not hidden-volume storage',       // duress/decoy limit
    'second vault',                    // ...forensic can detect
    'forensic',
    'not on-chain',                    // stealth hides in-app, not on-chain
    'block explorer',                  // addresses public
    'protects the device, not the seed', // panic wipe limit
    'reference copy',                  // explicitly does NOT replace the inline disclosures
  ]) {
    it(`states: "${phrase}"`, () => {
      expect(page).toContain(phrase);
    });
  }
});

describe('Terms/Legal — no storage write, no acceptance gate (the brief constraint)', () => {
  it('the page writes nothing to disk', () => {
    // No persistence APIs and no termsAccepted-style flag may appear on this page.
    for (const forbidden of [
      'termsAccepted', 'localStorage', 'sessionStorage', 'indexedDB',
      'setItem', 'vaultStore', 'walletMeta',
    ]) {
      expect(pageRaw, `page must not reference: "${forbidden}"`).not.toContain(forbidden);
    }
  });
  it('has no "I accept" acceptance affordance', () => {
    expect(page.toLowerCase()).not.toContain('i accept');
    expect(page.toLowerCase()).not.toContain('i agree');
  });
  it('no termsAccepted-style key is written from the Settings row either', () => {
    expect(settings).not.toContain('termsAccepted');
  });
});

describe('Terms/Legal — wired as an ordinary nav surface', () => {
  it('is registered as a route', () => {
    expect(app).toContain('/terms-legal');
    expect(app).toContain('TermsLegal');
  });
  it('is reachable from Settings via an ordinary link', () => {
    expect(settings).toContain('to="/terms-legal"');
  });
});
