import { describe, it, expect } from 'vitest';
import { sendAmountErrorKind } from '../sendAmountError';

// `amountNum` is always parseFloat(amount) in the caller, so the fixtures compute it
// the same way rather than hardcoding — that keeps the NaN case honest, since
// parseFloat("") === NaN is precisely what made "Amount is required" unreachable.
const at = (amount, over = {}) => ({
  amount,
  amountNum: parseFloat(amount),
  amountTouched: false,
  showErrors: false,
  balanceKnown: true,
  effectiveBalance: 10,
  ...over,
});

describe('sendAmountErrorKind — empty amount', () => {
  it('says nothing on a pristine form', () => {
    expect(sendAmountErrorKind(at(''))).toBeNull();
  });

  it('says nothing when the user merely tabbed through', () => {
    expect(sendAmountErrorKind(at('', { amountTouched: true }))).toBeNull();
  });

  it('reports missing on a submit attempt — the regression this fixes', () => {
    // Previously unreachable: the gate required Number.isFinite(parseFloat("")),
    // and parseFloat("") is NaN.
    expect(sendAmountErrorKind(at('', { showErrors: true }))).toBe('missing');
  });
});

describe('sendAmountErrorKind — non-positive amount', () => {
  it('stays silent while "0" is still being typed', () => {
    // "0" is the first character of "0.5"; the message is an assertive live region.
    expect(sendAmountErrorKind(at('0'))).toBeNull();
    expect(sendAmountErrorKind(at('0.'))).toBeNull();
  });

  it('reports not-positive once the user leaves the field', () => {
    expect(sendAmountErrorKind(at('0', { amountTouched: true }))).toBe('not-positive');
  });

  it('reports not-positive on submit', () => {
    expect(sendAmountErrorKind(at('0', { showErrors: true }))).toBe('not-positive');
  });

  it('treats a negative amount as not-positive', () => {
    expect(sendAmountErrorKind(at('-5', { amountTouched: true }))).toBe('not-positive');
  });

  it('clears once a positive amount is entered', () => {
    expect(sendAmountErrorKind(at('0.5', { amountTouched: true }))).toBeNull();
  });
});

describe('sendAmountErrorKind — over balance', () => {
  it('reports over-balance live, without waiting for blur', () => {
    // A fact about the value, not a half-typed artefact.
    expect(sendAmountErrorKind(at('11'))).toBe('over-balance');
  });

  it('says nothing when within balance', () => {
    expect(sendAmountErrorKind(at('9.5'))).toBeNull();
  });

  it('says nothing when the balance is unknown', () => {
    expect(sendAmountErrorKind(at('11', { balanceKnown: false }))).toBeNull();
  });

  it('is not triggered by an exactly-equal balance', () => {
    expect(sendAmountErrorKind(at('10'))).toBeNull();
  });
});

describe('sendAmountErrorKind — precedence and unparseable input', () => {
  it('prefers missing over everything else', () => {
    expect(sendAmountErrorKind(at('', { showErrors: true, balanceKnown: true }))).toBe('missing');
  });

  it('prefers not-positive over over-balance', () => {
    // 0 can never exceed a balance, but the ordering is asserted so a future edit
    // cannot silently swap which message wins.
    expect(sendAmountErrorKind(at('0', { showErrors: true }))).toBe('not-positive');
  });

  it('says nothing for unparseable input rather than guessing', () => {
    expect(sendAmountErrorKind(at('abc', { amountTouched: true, showErrors: true }))).toBeNull();
  });

  it('can return every kind, so no copy is dead', () => {
    const kinds = new Set([
      sendAmountErrorKind(at('', { showErrors: true })),
      sendAmountErrorKind(at('0', { amountTouched: true })),
      sendAmountErrorKind(at('11')),
    ]);
    expect(kinds).toEqual(new Set(['missing', 'not-positive', 'over-balance']));
  });
});
