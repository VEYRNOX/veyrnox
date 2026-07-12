// Copy guards for the user-enableable-security brief (Parts D + F).
//
// Two regression goals, both enforced as source-text assertions (the same
// readFileSync posture as security-framing.test.js — there is no DOM renderer in
// this project and these are static copy invariants):
//
//   Part D — the PIN-create screen drops the encryption-spec jargon (Argon2id /
//   AES-256-GCM) and carries the owner-set short line ("This unlocks your wallet.
//   An 8-digit PIN. Always guard your device.", PR #324). Asserting: jargon gone,
//   owner line present. The offline-brute-force limit is intentionally NOT repeated
//   on the keypad screen — it stays disclosed app-wide on the landing page and the
//   What-This-Protects screen, which the app-wide guard below pins so the honesty
//   disclosure can never silently disappear.
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

  it('renders the owner-set short line on the PIN-create screen', () => {
    expect(src).toContain(
      "This unlocks your wallet. An 8-digit PIN. Always guard your device."
    );
  });

  it('drops the encryption-spec jargon from the PIN-create copy', () => {
    // The exact create-screen jargon clause must be gone. (Scoped to this clause
    // so password-cohort vault-password screens, out of Part D scope, are
    // unaffected — the brief only trims the PIN-create + PIN-recover screens.)
    expect(src).not.toContain('Your PIN encrypts the wallet on this device (Argon2id + AES-256-GCM)');
    expect(src).not.toContain('It is 6 digits — strong against a quick grab');
  });
});

// The PIN-create screen drops the offline-brute-force caveat (PR #324) ONLY
// because it stays disclosed app-wide. Pin that disclosure so it can never be
// silently removed from BOTH the keypad screen and its app-wide homes at once.
describe('Part D — offline-brute-force limit stays disclosed app-wide', () => {
  it('landing page discloses the seized-device offline-guessing limit', () => {
    expect(read('pages/LandingPage.jsx')).toContain('offline-brute-forceable on a seized device');
  });

  it('What-This-Protects discloses that PINs can be tried offline', () => {
    expect(read('pages/WhatThisProtects.jsx')).toContain('try PINs offline');
  });
});

// Each entry: a page and the honest claims that must survive condensation. These
// are deliberately the LOAD-BEARING phrases of each disclosure — trim around
// them, never through them.
const HONESTY = {
  'pages/DuressPin.jsx': [
    'surrendered wallet under coercion',  // what it is (in file header comment)
    'examines the device may still find the second wallet', // device-access caveat (plausibility bullet)
    'second wallet',                      // ...a second wallet
    'no history, which makes it less convincing', // freshly-funded hidden-wallet limit
    'straight from the blockchain',       // balance is real from the blockchain
  ],
  'pages/StealthWallets.jsx': [
    'never reveals the count',            // not counted/hinted (pool-count concealment)
    'normal unlock screen',               // revealed via secret at normal prompt
    'no list',                            // no list of hidden wallets kept
    'every wallet',                       // chaff seeded for every device...
    'not "hidden wallets"',               // proves "VEYRNOX", not "hidden wallets"
    'not on-chain',                       // hides in app, not on-chain
    'public',                             // addresses public on explorer
    'unrecoverable',                      // forgotten secret = unrecoverable
    'previously-visible',                 // moving a visible wallet is weaker
  ],
  'pages/PanicWipe.jsx': [
    'irreversible',                       // destructive + irreversible
    'permanent',                          // permanent deletion disclosed
    'hidden wallets',                     // wipes all wallets including hidden
    'recovery phrase',                    // backup elsewhere still recovers
    'blockchain',                         // on-chain history stays public
    'different',                          // panic PIN must differ...
    'nothing gets wiped',                 // ...else that path wins and the wipe won't happen
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
