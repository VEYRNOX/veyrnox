// Gate for the Terms / Legal reference screen.
//
// The load-bearing constraint is that this is a STATIC reference screen, not an
// acceptance gate and not a stored-state feature: nothing is written to disk, so
// the screen reads identically in real and decoy sessions (I3) and there is no
// flag a coercer could read. These assertions enforce that, plus the content
// structure (real terms from veyrnox.com/terms, not-financial-advice disclaimer,
// honest coercion-limit copy).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');
const rendered = (rel) => read(rel).replace(/\s+/g, ' ');

const page = rendered('pages/TermsLegal.jsx');
const pageRaw = read('pages/TermsLegal.jsx');
const settings = read('pages/Settings.jsx');
const app = read('App.jsx');

describe('Terms/Legal — sections render', () => {
  for (const heading of [
    'Terms of Service',
    'Not financial advice',
    'Honest limits',
  ]) {
    it(`includes the "${heading}" section`, () => {
      expect(page).toContain(heading);
    });
  }
});

describe('Terms/Legal — real terms content (from veyrnox.com/terms)', () => {
  it('contains the last-updated date', () => {
    expect(page).toContain('28 June 2026');
  });
  it('links to the public terms URL', () => {
    expect(page).toContain('veyrnox.com/terms');
  });
  it('includes the non-custodial wallet declaration', () => {
    expect(page).toContain('non-custodial');
    expect(page).toContain('Seed Phrase');
  });
  it('has all 15 terms sections', () => {
    for (const title of [
      'Agreement to Terms',
      'Nature of the Service',
      'Your Responsibility for Keys',
      'Eligibility',
      'Permitted Use',
      'Blockchain & Digital Asset Risks',
      'Privacy',
      'Intellectual Property',
      'Updates to the App',
      'Disclaimer of Warranties',
      'Limitation of Liability',
      'Indemnification',
      'Termination',
      'Governing Law',
      'General Provisions',
    ]) {
      expect(page).toContain(title);
    }
  });
  it('includes the governing law jurisdiction', () => {
    expect(page).toContain('England and Wales');
  });
  it('includes the liability cap', () => {
    expect(page).toContain('100');
  });
  it('no longer has placeholder markers', () => {
    expect(page).not.toContain('to be supplied');
    expect(page.toLowerCase()).not.toMatch(/\bplaceholder\b/);
  });
});

describe('Terms/Legal — not-financial-advice disclaimer (live content)', () => {
  it('states Veyrnox does not provide financial advice', () => {
    expect(page).toContain('not provide financial');
  });
  it('states digital assets are volatile', () => {
    expect(page).toContain('highly volatile');
  });
  it('states transactions are irreversible', () => {
    expect(page).toContain('final and irreversible');
  });
});

describe('Terms/Legal — §D condensed coercion-limit reference copy present', () => {
  for (const phrase of [
    'not hidden-volume storage',
    'second vault',
    'forensic',
    'not on-chain',
    'block explorer',
    'protects the device, not the seed',
    'reference copy',
  ]) {
    it(`states: "${phrase}"`, () => {
      expect(page).toContain(phrase);
    });
  }
});

describe('Terms/Legal — no storage write, no acceptance gate (the brief constraint)', () => {
  it('the page writes nothing to disk', () => {
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
