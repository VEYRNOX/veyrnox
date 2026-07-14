// lib/__tests__/selfSend.test.js
//
// Pins the PURE self-send guard the Send flow uses to warn when the recipient is
// the sender's OWN active wallet address. Per-currency normalization: EVM is
// case-insensitive (EIP-55 is presentational); BTC/SOL are case-significant.
// WARN-not-block — these tests only assert the detection, the UI never hard-blocks.

import { describe, it, expect } from 'vitest';
import { isSelfSend, addressesEqualForCurrency } from '../selfSend.js';

// Testnet-safe literals; no funds, no network touched.
const EVM_CHECKSUMMED = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const EVM_LOWERCASE = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const EVM_OTHER = '0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729';
const BTC_TESTNET = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
const SOL_ADDRESS = 'Cp5MYrCMbUe7wra4ziGsVN672ZjpeLi5CFNj4Je7yFWK';

describe('isSelfSend — EVM (case-insensitive)', () => {
  it('flags an exact match', () => {
    expect(isSelfSend(EVM_CHECKSUMMED, EVM_CHECKSUMMED, 'ETH')).toBe(true);
  });

  it('flags a checksum-vs-lowercase match (EIP-55 is presentational)', () => {
    expect(isSelfSend(EVM_LOWERCASE, EVM_CHECKSUMMED, 'ETH')).toBe(true);
    expect(isSelfSend(EVM_CHECKSUMMED, EVM_LOWERCASE, 'ETH')).toBe(true);
  });

  it('flags a match across EVM ERC-20 currencies (same shared address)', () => {
    expect(isSelfSend(EVM_LOWERCASE, EVM_CHECKSUMMED, 'USDC')).toBe(true);
    expect(isSelfSend(EVM_CHECKSUMMED, EVM_LOWERCASE, 'MATIC')).toBe(true);
  });

  it('does NOT flag two different EVM addresses', () => {
    expect(isSelfSend(EVM_OTHER, EVM_CHECKSUMMED, 'ETH')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isSelfSend(`  ${EVM_CHECKSUMMED}  `, EVM_LOWERCASE, 'ETH')).toBe(true);
  });
});

describe('isSelfSend — BTC / SOL (case-significant)', () => {
  it('flags an exact BTC match', () => {
    expect(isSelfSend(BTC_TESTNET, BTC_TESTNET, 'BTC')).toBe(true);
  });

  it('does NOT case-fold BTC (a case-flipped string is a different address)', () => {
    expect(isSelfSend(BTC_TESTNET.toUpperCase(), BTC_TESTNET, 'BTC')).toBe(false);
  });

  it('flags an exact SOL match', () => {
    expect(isSelfSend(SOL_ADDRESS, SOL_ADDRESS, 'SOL')).toBe(true);
  });

  it('does NOT case-fold SOL base58', () => {
    expect(isSelfSend(SOL_ADDRESS.toLowerCase(), SOL_ADDRESS, 'SOL')).toBe(false);
  });
});

describe('isSelfSend — empty / missing inputs never warn and never throw', () => {
  it('returns false when either address is empty/null/undefined', () => {
    expect(isSelfSend('', EVM_CHECKSUMMED, 'ETH')).toBe(false);
    expect(isSelfSend(EVM_CHECKSUMMED, '', 'ETH')).toBe(false);
    expect(isSelfSend(null, EVM_CHECKSUMMED, 'ETH')).toBe(false);
    expect(isSelfSend(EVM_CHECKSUMMED, undefined, 'ETH')).toBe(false);
    expect(isSelfSend(undefined, undefined, 'ETH')).toBe(false);
  });

  it('whitespace-only inputs are treated as empty', () => {
    expect(isSelfSend('   ', EVM_CHECKSUMMED, 'ETH')).toBe(false);
  });

  it('unknown currency falls back to an exact compare (no throw)', () => {
    expect(isSelfSend('same-string', 'same-string', 'DOGE')).toBe(true);
    expect(isSelfSend('SAME-string', 'same-string', 'DOGE')).toBe(false);
  });
});

// 2026-07-14 audit LOW (internal-audit-2026-07-14-v2.md, "whitelist compare uses
// `.toLowerCase()` uniformly"). The whitelist compare in SendCrypto.jsx calls the
// EXPORTED `addressesEqualForCurrency` primitive directly (not via isSelfSend), so
// its per-currency contract must be pinned directly — otherwise a decoupling of
// isSelfSend from the primitive, or a semantic change to the primitive itself, could
// silently regress the whitelist path (which is otherwise guarded only by a
// structural import test in send-io-validators.test.js). The source fix landed in
// PR #976; these tests close the direct behavioural-coverage gap it left behind.
describe('addressesEqualForCurrency — whitelist-compare primitive, per-currency', () => {
  it('EVM: case-folds (checksum vs lowercase collapse to equal)', () => {
    expect(addressesEqualForCurrency(EVM_LOWERCASE, EVM_CHECKSUMMED, 'ETH')).toBe(true);
    expect(addressesEqualForCurrency(EVM_CHECKSUMMED, EVM_LOWERCASE, 'USDC')).toBe(true);
  });

  it('EVM: two different addresses are not equal', () => {
    expect(addressesEqualForCurrency(EVM_OTHER, EVM_CHECKSUMMED, 'ETH')).toBe(false);
  });

  it('BTC: exact base58 match is equal', () => {
    expect(addressesEqualForCurrency(BTC_TESTNET, BTC_TESTNET, 'BTC')).toBe(true);
  });

  it('BTC: a case-flipped string is NOT equal (case-significant encoding)', () => {
    // The exact regression the finding describes: a raw .toLowerCase() on both sides
    // would falsely equate two case-differing encodings and suppress the "not on
    // whitelist" warning. The BTC fixture is bech32 (lowercase by spec), so only the
    // upper-cased form differs from canonical — that must NOT be treated as equal.
    expect(addressesEqualForCurrency(BTC_TESTNET.toUpperCase(), BTC_TESTNET, 'BTC')).toBe(false);
  });

  it('SOL: exact base58 match is equal', () => {
    expect(addressesEqualForCurrency(SOL_ADDRESS, SOL_ADDRESS, 'SOL')).toBe(true);
  });

  it('SOL: a case-flipped base58 string is NOT equal (case-significant)', () => {
    expect(addressesEqualForCurrency(SOL_ADDRESS.toLowerCase(), SOL_ADDRESS, 'SOL')).toBe(false);
    expect(addressesEqualForCurrency(SOL_ADDRESS.toUpperCase(), SOL_ADDRESS, 'SOL')).toBe(false);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(addressesEqualForCurrency(`  ${BTC_TESTNET}  `, BTC_TESTNET, 'BTC')).toBe(true);
    expect(addressesEqualForCurrency(`  ${EVM_CHECKSUMMED}  `, EVM_LOWERCASE, 'ETH')).toBe(true);
  });

  it('empty / missing inputs return false and never throw', () => {
    expect(addressesEqualForCurrency('', BTC_TESTNET, 'BTC')).toBe(false);
    expect(addressesEqualForCurrency(SOL_ADDRESS, null, 'SOL')).toBe(false);
    expect(addressesEqualForCurrency(undefined, undefined, 'ETH')).toBe(false);
    expect(addressesEqualForCurrency('   ', BTC_TESTNET, 'BTC')).toBe(false);
  });
});
