// Validation sweep — SEND flow input/output validators (functional I/O).
//
// These exercise the PURE validators the Send screen actually uses (discovered, not
// invented): toBaseUnits (src/lib/sendDispatch.js) and isValidAddressForCurrency
// (src/lib/addressValidation.js). The existing suites cover the happy path; this
// adds the brief's adversarial amount/recipient cases and records the fail-open /
// missing-guard flags. See report: FLAG S1–S5.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toBaseUnits } from '@/lib/sendDispatch';
import { isValidAddressForCurrency } from '@/lib/addressValidation';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Real addresses (testnet-safe literals; no funds, no network touched).
const EVM_CHECKSUMMED = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // valid EIP-55
const EVM_LOWERCASE = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';   // no-checksum form
const EVM_BAD_CHECKSUM = '0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96046'; // last digit + case wrong
const BTC_TESTNET_SHAPED = 'tb1' + 'q' + 'a'.repeat(30); // matches the UI regex; checksum bogus

describe('Amount field — toBaseUnits boundary I/O', () => {
  it('rejects zero, negative, and empty (never a silent 0)', () => {
    expect(() => toBaseUnits('0', 8)).toThrow(/positive/);
    expect(() => toBaseUnits('-1', 8)).toThrow(/Invalid amount/);
    expect(() => toBaseUnits('', 8)).toThrow(/Invalid amount/);
  });

  it('rejects scientific notation (1e-3) rather than mis-parsing it', () => {
    expect(() => toBaseUnits('1e-3', 8)).toThrow(/Invalid amount/);
    expect(() => toBaseUnits('1E3', 8)).toThrow(/Invalid amount/);
  });

  it('rejects max-precision overflow instead of silently truncating', () => {
    // 9 dp against an 8-dp asset must THROW (not drop the last digit).
    expect(() => toBaseUnits('0.000000001', 8)).toThrow(/more than 8 decimal places/);
  });

  it('accepts leading zeros and a bare leading dot without precision loss', () => {
    expect(toBaseUnits('007', 8)).toBe(700000000n);
    expect(toBaseUnits('.5', 8)).toBe(50000000n);
    expect(toBaseUnits('1.50', 8)).toBe(150000000n);
  });

  it('rejects an address pasted into the amount field', () => {
    expect(() => toBaseUnits(EVM_CHECKSUMMED, 8)).toThrow(/Invalid amount/);
  });
});

describe('Recipient field — isValidAddressForCurrency I/O', () => {
  it('EVM: accepts checksummed and lowercase, rejects a corrupted-checksum address', () => {
    expect(isValidAddressForCurrency(EVM_CHECKSUMMED, 'ETH')).toBe(true);
    expect(isValidAddressForCurrency(EVM_LOWERCASE, 'ETH')).toBe(true);
    expect(isValidAddressForCurrency(EVM_BAD_CHECKSUM, 'ETH')).toBe(false);
  });

  it('EVM: a raw ENS string is NOT a valid address (must be resolved first)', () => {
    expect(isValidAddressForCurrency('vitalik.eth', 'ETH')).toBe(false);
  });

  it('cross-chain: an EVM address is invalid as BTC and as SOL', () => {
    expect(isValidAddressForCurrency(EVM_CHECKSUMMED, 'BTC')).toBe(false);
    expect(isValidAddressForCurrency(EVM_CHECKSUMMED, 'SOL')).toBe(false);
  });

  // FLAG S1 (FIXED) — BTC validation now does a REAL checksum + network check via
  // @scure/btc-signer's Address() (the same library + params enforced at sign time),
  // so a correctly-shaped tb1… string with a BOGUS checksum is rejected at the UI
  // gate — the user can no longer advance to the verify step with an unspendable
  // address. (Previously a shallow regex passed it; see fix/btc-address-validation.)
  it('FIXED: a checksum-invalid but well-shaped tb1… address is now rejected by the UI gate', () => {
    expect(isValidAddressForCurrency(BTC_TESTNET_SHAPED, 'BTC')).toBe(false);
  });

  // FLAG S2 (fail-open at the validator) — empty and unknown-currency inputs return
  // TRUE. The Send form separately blocks empty (`!toAddress`), so this is gated in
  // practice, but the validator itself is permissive (I4 "fail closed" prefers the
  // inverse default at the boundary).
  it('CONFIRMED fail-open default: empty string and unknown currency both return true', () => {
    expect(isValidAddressForCurrency('', 'ETH')).toBe(true);
    expect(isValidAddressForCurrency('literally anything', 'DOGE')).toBe(true);
  });
});

describe('FLAG S3 — self-send is now guarded (#179)', () => {
  const send = read('../../pages/SendCrypto.jsx');

  // RESOLVED: the Send flow now compares the recipient (toAddress) against the
  // active wallet's own address (selectedWallet?.address) via the pure
  // isSelfSend() helper (lib/selfSend.js), and surfaces a plain-language
  // WARN-not-block notice before signing. Per-currency normalization (EVM
  // case-insensitive; BTC/SOL case-significant) lives in the helper, which is
  // unit-tested in lib/__tests__/selfSend.test.js.
  it('the Send flow compares the recipient to the active wallet address', () => {
    expect(send).toMatch(/isSelfSend\(\s*toAddress\s*,\s*selectedWallet\??\.address/);
  });

  it('imports the pure self-send helper rather than inlining the compare', () => {
    expect(send).toMatch(/import\s*\{\s*isSelfSend\s*\}\s*from\s*["']@\/lib\/selfSend["']/);
  });
});

describe('FLAG S4 — amount field has no inputMode / step / min hardening', () => {
  const send = read('../../pages/SendCrypto.jsx');
  // The amount <Input type="number"> (placeholder "0.00") has no inputMode="decimal",
  // no min="0", no step — so on mobile it offers the wrong keypad and accepts the
  // browser's permissive number parsing (e.g. "1e3", "-0"). Documented; gated later
  // by toBaseUnits, but the field itself is unhardened.
  it('CONFIRMED: the amount input is a bare type="number" with placeholder "0.00"', () => {
    expect(send).toContain('placeholder="0.00"');
  });
  it.fails('IDEAL: the amount input declares inputMode="decimal" and min="0"', () => {
    expect(send).toMatch(/inputMode=["']decimal["']/);
    expect(send).toMatch(/min=["']0["']/);
  });
});
