// Boundary length caps on untrusted text inputs.
//
// Found by fuzzing every input in the app during 1.0.2 iPad QA: 12 of 13 text
// inputs accepted a 5,000-character paste. Only the referral code capped. That
// contradicts the project's own rule — "Input: validate length/type/range/
// allowlist at every boundary" — at the exact place the untrusted string
// enters.
//
// Nothing here is the authoritative control. Addresses are still validated by
// the address validators, amounts by `isFormAmountWellFormed` + `toBaseUnits`,
// the seed phrase by BIP-39 word/checksum validation, calldata by the decoder.
// These caps only bound what reaches them, so an unbounded paste cannot be fed
// to a resolver, a decoder, or a 96 MiB memory-hard KDF.
//
// Pinned as source assertions because jsdom enforces maxLength only for real
// user input events, not programmatic `.value` writes — a DOM-level test here
// would pass whether or not the attribute is present, i.e. it could not tell a
// working cap from a removed one.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

/**
 * Pull the single JSX element that carries `marker`, bounded STRUCTURALLY by
 * its own tag — not by a fixed character window.
 *
 * A fixed window is wrong here and was wrong the first time this was written:
 * SendCrypto's amount input carries a ~35-line comment between `id="send-amount"`
 * and its attributes, so any window small enough to avoid bleeding into the
 * next element is too small to contain the element's own props. Walk back to
 * the tag that opens this element and forward to the `/>` that closes it.
 */
function elementAround(src, marker) {
  const i = src.indexOf(marker);
  expect(i, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const open = src.lastIndexOf('<', i);
  expect(open, `no opening tag before ${marker}`).toBeGreaterThan(-1);
  const close = src.indexOf('/>', i);
  expect(close, `no self-closing tag after ${marker}`).toBeGreaterThan(open);
  return src.slice(open, close + 2);
}

describe('untrusted text inputs carry a boundary length cap', () => {
  it('send recipient and amount are capped', () => {
    const s = read('pages/SendCrypto.jsx');
    expect(elementAround(s, 'id="send-recipient"')).toMatch(/maxLength=\{\d+\}/);
    expect(elementAround(s, 'id="send-amount"')).toMatch(/maxLength=\{\d+\}/);
  });

  it('vault reset seed phrase and password are capped', () => {
    const s = read('pages/WalletAccessReset.jsx');
    expect(elementAround(s, 'id="reset-seed-phrase"')).toMatch(/maxLength=\{\d+\}/);
    expect(elementAround(s, 'id="reset-vault-password"')).toMatch(/maxLength=\{\d+\}/);
  });

  it('the seed-phrase cap still admits a full 24-word BIP-39 phrase', () => {
    // 24 words, longest English wordlist entry is 8 chars => 24*(8+1) = 216.
    const s = read('pages/WalletAccessReset.jsx');
    const m = elementAround(s, 'id="reset-seed-phrase"').match(/maxLength=\{(\d+)\}/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(216);
  });

  it('the password cap does not punish a long passphrase', () => {
    const s = read('pages/WalletAccessReset.jsx');
    const m = elementAround(s, 'id="reset-vault-password"').match(/maxLength=\{(\d+)\}/);
    expect(Number(m[1])).toBeGreaterThanOrEqual(128);
  });

  it('screening and lookup inputs are capped', () => {
    expect(elementAround(read('pages/SecurityScanner.jsx'), 'placeholder="0xa9059cbb'))
      .toMatch(/maxLength=\{\d+\}/);
    expect(elementAround(read('pages/DAppSecurityAlerts.jsx'), 'aria-label="DApp URL"'))
      .toMatch(/maxLength=\{\d+\}/);
    expect(elementAround(read('pages/LiveBalances.jsx'), 'aria-label="EVM wallet address"'))
      .toMatch(/maxLength=\{\d+\}/);
  });

  it('the address-book contact address is capped', () => {
    expect(elementAround(read('pages/AddressBook.jsx'), 'id="contact-address"'))
      .toMatch(/maxLength=\{\d+\}/);
  });
});
