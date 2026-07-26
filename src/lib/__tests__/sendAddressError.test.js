import { describe, it, expect } from 'vitest';
import { sendAddressErrorKind } from '../sendAddressError';

// Shorthand: the empty field is ALWAYS addressFormatValid=true, because
// isValidAddressForCurrency returns true for "" by contract. Encoding that here
// keeps the cases honest — it is exactly the fact that made the old
// `!addressFormatValid` gate unreachable for an empty address.
const empty = (over = {}) => ({
  toAddress: '', addressFormatValid: true, addressTouched: false, showErrors: false, ...over,
});
const bad = (over = {}) => ({
  toAddress: 'not-an-address', addressFormatValid: false, addressTouched: false, showErrors: false, ...over,
});
const good = (over = {}) => ({
  toAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  addressFormatValid: true, addressTouched: false, showErrors: false, ...over,
});

describe('sendAddressErrorKind — empty recipient', () => {
  it('says nothing on a pristine form', () => {
    expect(sendAddressErrorKind(empty())).toBeNull();
  });

  it('says nothing when the user merely tabbed through the field', () => {
    // Deliberate: an empty recipient is the starting state, not a mistake. Firing
    // "required" on blur would scold someone on their way to the amount field.
    expect(sendAddressErrorKind(empty({ addressTouched: true }))).toBeNull();
  });

  it('reports missing once the user tries to submit — the regression this fixes', () => {
    // Previously unreachable: the message was gated behind !addressFormatValid,
    // which an empty address can never make false.
    expect(sendAddressErrorKind(empty({ showErrors: true }))).toBe('missing');
  });

  it('still reports missing when the field was touched and then submitted', () => {
    expect(sendAddressErrorKind(empty({ addressTouched: true, showErrors: true }))).toBe('missing');
  });
});

describe('sendAddressErrorKind — malformed recipient', () => {
  it('stays silent while the user is still typing', () => {
    // role="alert" is assertive; every address is malformed until complete.
    expect(sendAddressErrorKind(bad())).toBeNull();
  });

  it('reports malformed once the user leaves the field', () => {
    expect(sendAddressErrorKind(bad({ addressTouched: true }))).toBe('malformed');
  });

  it('reports malformed on a submit attempt even if never blurred', () => {
    expect(sendAddressErrorKind(bad({ showErrors: true }))).toBe('malformed');
  });
});

describe('sendAddressErrorKind — valid recipient', () => {
  it('says nothing in any combination of touched/submitted', () => {
    for (const addressTouched of [false, true]) {
      for (const showErrors of [false, true]) {
        expect(sendAddressErrorKind(good({ addressTouched, showErrors }))).toBeNull();
      }
    }
  });
});

describe('sendAddressErrorKind — both branches are reachable', () => {
  it('can return each kind, so no copy is dead', () => {
    const kinds = new Set([
      sendAddressErrorKind(empty({ showErrors: true })),
      sendAddressErrorKind(bad({ addressTouched: true })),
    ]);
    expect(kinds).toEqual(new Set(['missing', 'malformed']));
  });
});
