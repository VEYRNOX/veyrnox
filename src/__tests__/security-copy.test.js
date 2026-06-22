// Copy guards for the user-enableable-security brief (Parts D + F).
//
// Two regression goals, both enforced as source-text assertions (the same
// readFileSync posture as security-framing.test.js — there is no DOM renderer in
// this project and these are static copy invariants):
//
//   Part D — the PIN-create screen drops the encryption-spec jargon (Argon2id /
//   AES-256-GCM) but KEEPS the committed offline-brute-force honesty disclosure
//   (PR #154). Asserting both: jargon gone, honesty line present.
//
//   Part F — the three coercion-feature pages are condensed (fewer words) but
//   every honest limitation survives. Each bullet below pins one honesty point
//   from the brief so condensation can shorten prose without silently dropping a
//   disclosure. This is the substance-preserved gate; security-framing.test.js
//   remains the no-configured-state gate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');

describe('Part D — PIN-create copy reduction', () => {
  const src = read('components/WalletEntry.jsx');

  it('renders the single tightened line on the PIN-create screen', () => {
    expect(src).toContain(
      'An 8-digit PIN is strong against a quick grab, but not against someone who keeps your device to try PINs offline — so guard the device itself.'
    );
  });

  it('drops the encryption-spec jargon from the PIN-create copy', () => {
    // The exact create-screen jargon clause must be gone. (Scoped to this clause
    // so password-cohort vault-password screens, out of Part D scope, are
    // unaffected — the brief only trims the PIN-create + PIN-recover screens.)
    expect(src).not.toContain('Your PIN encrypts the wallet on this device (Argon2id + AES-256-GCM)');
    expect(src).not.toContain('It is 6 digits — strong against a quick grab');
  });

  it('keeps the committed offline-brute-force disclosure (PR #154)', () => {
    expect(src).toContain('try PINs offline');
  });
});

// Each entry: a page and the honest claims that must survive condensation. These
// are deliberately the LOAD-BEARING phrases of each disclosure — trim around
// them, never through them.
const HONESTY = {
  'pages/DuressPin.jsx': [
    'decoy wallet under coercion',        // what it is
    'runtime deniability',                // deniability class
    'forensic',                           // forensic inspection can detect
    'second vault',                       // ...a second vault
    'no transaction history',             // freshly-funded decoy limit
    'sophisticated coercer',              // may still suspect
    'block explorer',                     // balance is real / live on-chain
    'pending independent audit',          // provisional/unaudited
  ],
  'pages/StealthWallets.jsx': [
    'no list, no count, no indicator',    // not listed/counted/hinted
    'normal unlock screen',               // revealed via secret at normal prompt
    'count deniability',                  // runtime + count deniability
    'not hidden-volume storage',          // NOT a hidden volume (banner phrasing, contiguous in source)
    'every',                              // chaff seeded for every device...
    'not "this device has hidden wallets"',
    'not on-chain',                       // hides in app, not on-chain
    'public',                             // addresses public on explorer
    'unrecoverable',                      // forgotten secret = unrecoverable
    'previously-visible',                 // moving a visible wallet is weaker
    'pending independent audit',
  ],
  'pages/PanicWipe.jsx': [
    'irreversible',                       // destructive + irreversible
    'safety-critical',                    // safety-critical
    'stealth',                            // wipes primary + decoy + stealth pool...
    'panic marker',                       // ...+ panic marker
    'seed backup',                        // backup elsewhere still recovers
    'protects the device, not the',       // wipe protects device, not seed
    'on-chain',                           // on-chain history stays public
    'different',                          // panic PIN must differ...
    'the wipe never fires',               // ...else that path wins
    'pending independent audit',
  ],
};

// Collapse runs of whitespace to a single space so an assertion matches the
// RENDERED text, not the source's line-wrapping (JSX collapses whitespace the
// same way). Without this, a phrase that happens to wrap across two JSX lines —
// "count\n  deniability" — would fail despite reading correctly on screen.
const rendered = (rel) => read(rel).replace(/\s+/g, ' ');

describe('Part F — coercion-page honesty points survive condensation', () => {
  for (const [page, claims] of Object.entries(HONESTY)) {
    const src = rendered(page);
    for (const claim of claims) {
      it(`${page} still states: "${claim}"`, () => {
        expect(src, `missing honesty point: "${claim}"`).toContain(claim);
      });
    }
  }
});
