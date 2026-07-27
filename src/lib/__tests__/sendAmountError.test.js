import { describe, it, expect } from 'vitest';
import { sendAmountErrorKind } from '../sendAmountError';

// `amountNum` is always parseFloat(amount) in the caller, so the fixtures compute it
// the same way rather than hardcoding — that keeps the NaN case honest, since
// parseFloat("") === NaN is precisely what made "Amount is required" unreachable.
//
// `wellFormed` mirrors isFormAmountWellFormed(amount) — the SAME predicate the
// Continue gate uses (SendCrypto.jsx). It is passed in rather than imported so the
// helper stays dependency-free; the predicate has its own coverage in
// pages/__tests__/SendCrypto.amountValidity.test.js. The local mirror below is only
// so fixtures don't have to hand-label every case.
const wellFormedMirror = (s) =>
  /^\d+(\.\d+)?$|^\.\d+$/.test(String(s ?? '').trim()) && /[1-9]/.test(String(s ?? '').trim());

const at = (amount, over = {}) => ({
  amount,
  amountNum: parseFloat(amount),
  wellFormed: wellFormedMirror(amount),
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

  it('prefers malformed over over-balance', () => {
    // "1e99" is both unusable AND over balance. The shape problem is the one the
    // user can act on, so it wins.
    expect(sendAmountErrorKind(at('1e99', { amountTouched: true }))).toBe('malformed');
  });

  it('prefers not-positive over malformed for "0"', () => {
    // "0" is also not well-formed (the predicate requires a non-zero digit), but
    // "must be greater than zero" is more specific than "enter a plain decimal".
    expect(sendAmountErrorKind(at('0', { amountTouched: true }))).toBe('not-positive');
  });

  it('can return every kind, so no copy is dead', () => {
    const kinds = new Set([
      sendAmountErrorKind(at('', { showErrors: true })),
      sendAmountErrorKind(at('0', { amountTouched: true })),
      sendAmountErrorKind(at('1e-8', { amountTouched: true })),
      sendAmountErrorKind(at('11')),
    ]);
    expect(kinds).toEqual(new Set(['missing', 'not-positive', 'malformed', 'over-balance']));
  });
});

// THE SILENT DEAD-END. Continue is gated on isFormAmountWellFormed(amount), which
// rejects exponent notation, locale commas, multiple dots and trailing dots. The
// helper previously returned null for every one of them — parseFloat("1e-8") is
// finite, positive and within balance — so pressing Continue set showErrors, blocked
// the submit, and rendered nothing. A dead button with no explanation, for keyboard
// and screen-reader users alike. These cases are exactly the gate's reject set.
describe('sendAmountErrorKind — malformed input', () => {
  const MALFORMED = ['1e-8', '1E-3', '1,5', '1.2.3', '1.', 'abc', '1e99'];

  it.each(MALFORMED)('reports malformed for %s once the user leaves the field', (v) => {
    expect(sendAmountErrorKind(at(v, { amountTouched: true }))).toBe('malformed');
  });

  it.each(MALFORMED)('reports malformed for %s on a submit attempt', (v) => {
    expect(sendAmountErrorKind(at(v, { showErrors: true }))).toBe('malformed');
  });

  it('stays silent while a trailing dot is still being typed', () => {
    // "1." is the halfway point of "1.5" — blur-gated like not-positive, so the
    // assertive-interruption bug is not simply moved to a new message.
    expect(sendAmountErrorKind(at('1.'))).toBeNull();
    expect(sendAmountErrorKind(at('1e'))).toBeNull();
  });

  it('never fires for a well-formed decimal', () => {
    for (const v of ['1', '0.5', '.45', '10', '9.99999']) {
      expect(sendAmountErrorKind(at(v, { amountTouched: true, showErrors: true })))
        .not.toBe('malformed');
    }
  });

  it('agrees with the Continue gate: every blocked value now explains itself', () => {
    // The invariant the original bug violated. If the gate rejects it, the form
    // must say something once the user has submitted.
    for (const v of MALFORMED) {
      expect(sendAmountErrorKind(at(v, { showErrors: true }))).not.toBeNull();
    }
  });
});
