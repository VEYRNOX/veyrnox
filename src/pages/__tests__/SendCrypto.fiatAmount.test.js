// SendCrypto — fiat-mode amount entry (QA MNY-04, 2026-09-21).
//
// Fiat mode used `parseFloat(normalizeDecimalInput(raw))`. normalizeDecimalInput
// returns unmatched input unchanged and parseFloat is lenient, so "1.2.3" became
// $1.2 and en-US "1,5" became $1 — a well-formed crypto amount computed from a
// number the user never typed, while the field still displayed what they typed.
// Contract pinned here: malformed fiat input must leave `amount` in a state the
// SAME Continue gate (isFormAmountWellFormed on the canonical form) rejects, and
// the error helper must say 'malformed' — never a silently truncated value.

import { describe, it, expect } from 'vitest';
import { fiatDraftToCryptoAmount, isFormAmountWellFormed } from '../SendCrypto.jsx';
import { normalizeDecimalInput } from '../../lib/locale.js';
import { sendAmountErrorKind } from '../../lib/sendAmountError.js';

const RATE = 2; // $2 per unit keeps the arithmetic obvious
const DEC = 8;

// Mirrors the page: canonicalAmount = normalizeDecimalInput(amount, locale).
function gate(raw, locale) {
  const amount = fiatDraftToCryptoAmount(raw, locale, RATE, DEC);
  const canonical = normalizeDecimalInput(amount, locale);
  const wellFormed = isFormAmountWellFormed(canonical);
  const kind = sendAmountErrorKind({
    amount,
    amountNum: parseFloat(canonical),
    wellFormed,
    amountTouched: true,
    showErrors: true,
    balanceKnown: false,
    effectiveBalance: 0,
  });
  return { amount, wellFormed, kind };
}

describe('SendCrypto fiat amount (MNY-04)', () => {
  it.each([
    ['1.2.3', 'en-US'],
    ['1,5', 'en-US'],
    ['1.', 'en-US'],
    ['abc', 'en-US'],
    ['1e2', 'en-US'],
  ])('rejects malformed fiat %j (%s): gate closed, kind=malformed', (raw, locale) => {
    const r = gate(raw, locale);
    expect(r.wellFormed).toBe(false);
    expect(r.kind).toBe('malformed');
  });

  it('zero fiat reports not-positive, not a conversion', () => {
    const r = gate('0', 'en-US');
    expect(r.wellFormed).toBe(false);
    expect(r.kind).toBe('not-positive');
  });

  it('converts a valid en-US "1.50"', () => {
    const r = gate('1.50', 'en-US');
    expect(r.amount).toBe('0.75');
    expect(r.wellFormed).toBe(true);
    expect(r.kind).toBeNull();
  });

  it('converts a valid de-DE "1,5"', () => {
    const r = gate('1,5', 'de-DE');
    expect(r.amount).toBe('0.75');
    expect(r.wellFormed).toBe(true);
    expect(r.kind).toBeNull();
  });

  it('converts a grouped en-US "1,000.50"', () => {
    expect(gate('1,000.50', 'en-US').amount).toBe('500.25');
  });
});
