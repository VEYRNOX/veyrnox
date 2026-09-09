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

// The consent copy also has to be COMPLETE, not merely non-false. §9 of
// TermsLegal.jsx enumerates the payload exhaustively; the consent screen is
// what the user actually grants against, so anything §9 lists has to be here
// too. Two items were missing until 2026-09-09:
//
//   - the app display language, in the system prompt at SecurityAdvisor.jsx
//     (`Current app language: ${currentLanguageName} (${currentLanguage})`)
//   - the persistent per-install device_id, minted by getOrCreateDeviceId()
//     and sent with every request to enforce the TIP-side 30-turns/24h cap
//
// device_id in particular is minted regardless of the telemetry answer —
// lib/deviceId.js checks no consent of its own — so a user who declined usage
// events still gets one the first time they enable the Advisor. That is the
// surprising part, and it is why the copy says so explicitly.
describe('advisor.consent.body_1 — payload completeness', () => {
  it.each(locales)('%s discloses the app display language', (locale) => {
    expect(readBody1(locale)).toMatch(/display language/i);
  });

  it.each(locales)('%s discloses the per-install identifier', (locale) => {
    expect(readBody1(locale)).toMatch(/per-install ID/i);
  });

  it.each(locales)('%s says the identifier survives a declined telemetry answer', (locale) => {
    expect(readBody1(locale)).toMatch(/even if you declined usage events/i);
  });
});
