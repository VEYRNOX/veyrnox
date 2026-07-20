// Honesty guard for the user-facing Documentation page (src/pages/Documentation.jsx).
//
// Background (finding S-1): PR #1243 legitimately scrubbed internal codenames, PR
// numbers, txids, and device names from this page — that goal is preserved and this
// file also asserts the jargon stays out. But the same rewrite ALSO deleted several
// honest, plain-language SECURITY LIMITATIONS while leaving those features tagged
// "Available" with no caveat, and stripped the status legend that explained what
// "Available" means — leaving caveat-free copy sitting under an unqualified badge
// (an I4 honesty regression). This test pins the restored caveats and the legend so
// a future copy-scrub pass can remove jargon without silently deleting the honesty
// content next to it.
//
// Same posture as terms-legal.test.js / security-copy.test.js: read the source file
// as text (this repo has no DOM renderer for these pages), collapse whitespace so
// JSX line-wrapping doesn't break a phrase match, and assert on the rendered text.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');
const rendered = (rel) => read(rel).replace(/\s+/g, ' ');

const page = rendered('pages/Documentation.jsx');

describe('Documentation page — restored honesty caveats (S-1)', () => {
  it('PIN Unlock discloses that a PIN alone can be repeatedly tried if device storage is extracted', () => {
    expect(page).toContain(
      "a PIN can be repeatedly tried if someone extracts your device's storage"
    );
  });

  it('PIN Unlock names Hardware Key Protection as off by default, not a given', () => {
    expect(page).toContain('Hardware Key Protection (off by default) closes that gap');
  });

  it('Hardware Key Protection is described as optional / off by default', () => {
    expect(page).toContain('Optional, off-by-default protection');
  });

  it('Hardware Key Protection guarantee is conditional on the user turning it on', () => {
    expect(page).toContain('Once turned on, your PIN alone is no longer enough');
  });

  it('Hardware Key Protection does not promise a specific hardware tier is guaranteed', () => {
    // The old text implied StrongBox specifically; the fix says "the strongest
    // option your device supports" instead of guaranteeing any one tier.
    expect(page).toContain('using the strongest option your device supports');
    expect(page).not.toContain('StrongBox-preferred');
  });

  it('Hardware Key Protection no longer asserts an unconditional guarantee', () => {
    // The unqualified, always-true claim that was removed by the S-1 fix.
    expect(page).not.toContain(
      'even if your PIN is compromised, the vault cannot be decrypted'
    );
  });

  it('Hardware Wallet discloses it has not been tested against physical hardware', () => {
    expect(page).toContain('not yet tested against a physical Trezor device');
  });

  it('Hardware Wallet caveat does not use a verification claim', () => {
    // I4: "built"/"code-reviewed" are fine; "verified"/"device-verified" are not,
    // since no physical Trezor test has happened.
    expect(page).not.toMatch(/device-verified|hardware-verified/i);
  });

  it('Referral Tracker discloses exactly what leaves the device', () => {
    expect(page).toContain(
      "sends your referral code, chosen plan, and purchase/discount amounts to VEYRNOX's servers"
    );
  });

  it('Referral Tracker explicitly excludes balances, addresses, and seed phrase from what is sent', () => {
    expect(page).toContain(
      'your balances, addresses, and seed phrase are never sent'
    );
  });

  it('status legend explains what "Available" means and disclaims independent review', () => {
    expect(page).toContain('means shipped and working today');
    expect(page).toContain("not an independent security review");
  });
});

describe('Documentation page — jargon-free (I4 / PR #1243 goal preserved)', () => {
  // These are internal codenames, PR numbers, txids, and device names that PR
  // #1243 deliberately scrubbed from this user-facing page. The S-1 fix restores
  // honesty content WITHOUT reintroducing any of them.
  const bannedPatterns = [
    /\bPR ?#\d+/i,
    /\b0x[0-9a-f]{16,}/i, // txid-shaped hex strings
    /\bSepolia\b/i,
    /\bI[2-6]\b/, // invariant codenames I2-I6 (no /i flag: lowercase "iOS" never matches)
    /\bM2[cd]\b/i,
    /\bRASP\b/,
    /\bKEK\b/,
    /\bF-09\b/,
    /\bPixel \d+/i,
    /\biPhone \d+/i,
    /\bSamsung Galaxy\b/i,
    /\bTIER\.[A-Z]+/,
  ];

  const src = read('pages/Documentation.jsx');

  for (const pattern of bannedPatterns) {
    it(`does not contain internal-jargon pattern: ${pattern}`, () => {
      expect(src).not.toMatch(pattern);
    });
  }
});

describe('Documentation page — zero storage writes / zero network calls (static reference screen)', () => {
  const src = read('pages/Documentation.jsx');

  it('never writes to localStorage, sessionStorage, or IndexedDB', () => {
    expect(src).not.toMatch(/localStorage\.setItem|sessionStorage\.setItem|indexedDB/);
  });

  it('never calls fetch or an API client', () => {
    expect(src).not.toMatch(/\bfetch\(|supabase\.|axios\./);
  });
});
