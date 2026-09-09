// Regression pin for the Advisor consent copy (advisor.consent.body_1).
//
// Until 2026-09-09 every one of the 44 locale files, plus the inline
// defaultValue in SecurityAdvisor.jsx, told the user at the consent gate:
//
//   "Your addresses, balances, seed and PIN are never included."
//
// The address half was false. src/lib/advisorScrubber.js strips BIP-39 runs,
// EVM/bare hex private keys, xprv/yprv/zprv/tprv/uprv/vprv, WIF, Solana
// secrets and PIN-shaped digit runs — it carries NO address pattern, so a
// wallet address typed or pasted into chat reaches the model verbatim and is
// also sent to tip-screen for an address_lookup. TermsLegal.jsx §9 says so;
// the consent screen, which is the string the user actually grants against,
// did not.
//
// This pin reads the PARSED JSON VALUE rather than grepping the file, on
// purpose: the fix for this defect necessarily quotes the retired sentence in
// a comment explaining what was removed, and a whole-file text assertion
// would match that comment and fire on correct work.
//
// Mutation-checked 2026-09-09: restoring the old sentence in a single locale
// turns this red.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.resolve(__dirname, '../locales');

/** Any claim that addresses are not sent. The defect this pin exists to catch. */
const FALSE_ADDRESS_GUARANTEE = /address\w*[^.]*never (included|sent|shared)/i;

function readBody1(locale) {
  const file = path.join(LOCALES_DIR, locale, 'wallet.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return json?.advisor?.consent?.body_1;
}

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe('advisor.consent.body_1 — address honesty', () => {
  it('covers every shipped locale', () => {
    expect(locales.length).toBeGreaterThanOrEqual(44);
  });

  it.each(locales)('%s does not promise that addresses are never sent', (locale) => {
    const body1 = readBody1(locale);
    expect(body1, `${locale} is missing advisor.consent.body_1`).toBeTruthy();
    expect(body1).not.toMatch(FALSE_ADDRESS_GUARANTEE);
  });

  it.each(locales)('%s states that addresses are not stripped', (locale) => {
    expect(readBody1(locale)).toMatch(/addresses are not stripped/i);
  });
});
