// lib/__tests__/selfSend.test.js
//
// Pins the PURE self-send guard the Send flow uses to warn when the recipient is
// the sender's OWN active wallet address. Per-currency normalization: EVM is
// case-insensitive (EIP-55 is presentational); BTC/SOL are case-significant.
// WARN-not-block — these tests only assert the detection, the UI never hard-blocks.

import { describe, it, expect } from 'vitest';
import { isSelfSend } from '../selfSend.js';

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
