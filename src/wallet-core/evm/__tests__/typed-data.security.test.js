// Security-focused tests for the EIP-712 typed-data DECODE/CLASSIFY/DESCRIBE module.
//
// NOTE ON SCOPE: src/wallet-core/evm/typed-data.js does NOT implement EIP-712
// hashing (no domainSeparator / hashStruct / encodeType). The actual struct
// hashing is delegated to ethers' wallet.signTypedData(...) (see
// src/lib/WalletConnectProvider.jsx). This module's job is to parse untrusted
// typed-data JSON, classify whether signing it would AUTHORISE asset movement
// (Permit / Permit2 / Seaport), and produce a human summary for the signing
// prompt. These tests therefore guard the parse robustness, the
// asset-authorising detection gate (the control that warns users before they
// sign a wallet-draining Permit), and the fidelity of the describe output that
// distinguishes one chain/contract from another.
//
// The existing typed-data.test.js covers the happy paths; this file adds
// non-overlapping edge cases and the domain-separation property.

import { describe, it, expect } from 'vitest';
import {
  parseTypedData,
  detectAssetAuthorising,
  describeTypedData,
} from '../typed-data.js';

// The canonical EIP-712 "Mail/Person" example from the spec. Used here not for a
// hash vector (the module does not hash) but as a realistic well-formed payload.
const MAIL_TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCcCcCccccccCCccCcccCCCC',
  },
  message: {
    from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  },
};

// A real-shape EIP-2612 Permit (the highest-risk thing a wallet can be asked to
// sign off-chain — it authorises a spender with no on-chain approval tx).
function makePermit({ chainId = 1, verifyingContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7' } = {}) {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    domain: { name: 'USD Coin', version: '2', chainId, verifyingContract },
    message: {
      owner: '0x1111111111111111111111111111111111111111',
      spender: '0x2222222222222222222222222222222222222222',
      value: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      nonce: 0,
      deadline: 1900000000,
    },
  };
}

describe('parseTypedData — robustness on malformed / hostile input', () => {
  it('rejects null without throwing', () => {
    const r = parseTypedData(null);
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('rejects the JSON literal "null" string without throwing', () => {
    // JSON.parse('null') === null, which must not be treated as valid typed data.
    const r = parseTypedData('null');
    expect(r.valid).toBe(false);
  });

  it('rejects a JSON array (parses but is not a typed-data object)', () => {
    const r = parseTypedData('[1,2,3]');
    expect(r.valid).toBe(false);
  });

  it('rejects when `types` is present but `message` is missing', () => {
    const r = parseTypedData({ types: {}, primaryType: 'Permit' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/message/i);
  });

  it('rejects when `types` is missing', () => {
    const r = parseTypedData({ primaryType: 'Permit', message: {} });
    expect(r.valid).toBe(false);
  });

  it('defaults domain to an empty object when omitted (so describe never throws)', () => {
    const r = parseTypedData({
      types: { Foo: [] },
      primaryType: 'Foo',
      message: { a: 1 },
    });
    expect(r.valid).toBe(true);
    expect(r.domain).toEqual({});
  });

  it('does not lose data: a valid parse round-trips primaryType and message', () => {
    const r = parseTypedData(MAIL_TYPED_DATA);
    expect(r.valid).toBe(true);
    expect(r.primaryType).toBe('Mail');
    expect(r.message.contents).toBe('Hello, Bob!');
  });

  it('parsing a string and the equivalent object yield the same structural result', () => {
    const fromObj = parseTypedData(MAIL_TYPED_DATA);
    const fromStr = parseTypedData(JSON.stringify(MAIL_TYPED_DATA));
    expect(fromStr).toEqual(fromObj);
  });
});

describe('detectAssetAuthorising — the wallet-drain warning gate', () => {
  it('flags every EIP-2612 / Permit2 primary type as asset-authorising', () => {
    // These are the primary types whose off-chain signature can move tokens.
    for (const pt of [
      'Permit',
      'PermitSingle',
      'PermitBatch',
      'PermitTransferFrom',
      'PermitWitnessTransferFrom',
    ]) {
      const parsed = parseTypedData({
        types: { [pt]: [{ name: 'spender', type: 'address' }] },
        primaryType: pt,
        message: { spender: '0x2222222222222222222222222222222222222222' },
      });
      const r = detectAssetAuthorising(parsed);
      expect(r.isAssetAuthorising, `${pt} must be flagged`).toBe(true);
      expect(r.kind).toBe('permit');
      expect(r.reason).toMatch(/Permit/);
    }
  });

  it('flags Seaport marketplace orders as asset-authorising', () => {
    for (const pt of ['OrderComponents', 'BulkOrder']) {
      const parsed = parseTypedData({
        types: { [pt]: [{ name: 'offerer', type: 'address' }] },
        primaryType: pt,
        message: { offerer: '0x3333333333333333333333333333333333333333' },
      });
      const r = detectAssetAuthorising(parsed);
      expect(r.isAssetAuthorising, `${pt} must be flagged`).toBe(true);
      expect(r.kind).toBe('marketplace_order');
      expect(r.reason).toMatch(/order/i);
    }
  });

  it('does NOT flag a benign typed message (e.g. the Mail example)', () => {
    const r = detectAssetAuthorising(parseTypedData(MAIL_TYPED_DATA));
    expect(r.isAssetAuthorising).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('is case-sensitive: a lookalike type is NOT silently treated as a Permit', () => {
    // Guards against the classifier being loosened to a substring/case-insensitive
    // match, which would let "permit"/"MyPermitThing" masquerade and also risk
    // false-flagging unrelated types. Detection is an exact primaryType match.
    const r = detectAssetAuthorising(
      parseTypedData({
        types: { permit: [{ name: 'x', type: 'uint256' }] },
        primaryType: 'permit', // lowercase — not the canonical 'Permit'
        message: { x: 1 },
      }),
    );
    expect(r.isAssetAuthorising).toBe(false);
  });

  it('fails closed on invalid parse input (never claims authorising on garbage)', () => {
    expect(detectAssetAuthorising({ valid: false }).isAssetAuthorising).toBe(false);
    expect(detectAssetAuthorising(parseTypedData('not json')).isAssetAuthorising).toBe(false);
  });

  it('classification is stable: identical input gives identical result', () => {
    const a = detectAssetAuthorising(parseTypedData(makePermit()));
    const b = detectAssetAuthorising(parseTypedData(makePermit()));
    expect(a).toEqual(b);
  });
});

describe('describeTypedData — domain separation in the user-facing summary', () => {
  it('surfaces chainId and verifyingContract so the user can tell chains apart', () => {
    const r = describeTypedData(parseTypedData(makePermit({ chainId: 1 })));
    expect(r.chainId).toBe(1);
    expect(r.contract).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(r.primaryType).toBe('Permit');
  });

  it('the SAME struct under a DIFFERENT chainId produces a DIFFERENT description', () => {
    // In-module analogue of EIP-712 cross-chain collision resistance: a Permit
    // replayed across chains must not look identical in the signing prompt.
    const mainnet = describeTypedData(parseTypedData(makePermit({ chainId: 1 })));
    const sepolia = describeTypedData(parseTypedData(makePermit({ chainId: 11155111 })));
    expect(mainnet.chainId).not.toBe(sepolia.chainId);
    expect(mainnet).not.toEqual(sepolia);
  });

  it('the SAME struct under a DIFFERENT verifyingContract produces a DIFFERENT description', () => {
    const a = describeTypedData(
      parseTypedData(makePermit({ verifyingContract: '0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' })),
    );
    const b = describeTypedData(
      parseTypedData(makePermit({ verifyingContract: '0xBbBbBBBbBBBbBbBbBbbbbbBBbBbBBBbbBBBbBBbBb' })),
    );
    expect(a.contract).not.toBe(b.contract);
    expect(a).not.toEqual(b);
  });

  it('flattens message fields to name/value pairs, stringifying every value', () => {
    const r = describeTypedData(parseTypedData(makePermit()));
    const value = r.fields.find((f) => f.name === 'value');
    const nonce = r.fields.find((f) => f.name === 'nonce');
    // Big uint256 must survive as its exact decimal string (no precision loss) —
    // and a type-max allowance is flagged UNLIMITED so it can't hide in a long number.
    expect(value.value).toContain('UNLIMITED');
    expect(value.value).toContain('115792089237316195423570985008687907853269984665640564039457584007913129639935');
    // Numeric 0 must stringify to "0", not be dropped as falsy.
    expect(nonce.value).toBe('0');
    expect(typeof nonce.value).toBe('string');
  });

  it('falls back gracefully when the domain has no name (no "undefined" leakage)', () => {
    const r = describeTypedData(
      parseTypedData({
        types: { Transfer: [{ name: 'to', type: 'address' }] },
        primaryType: 'Transfer',
        message: { to: '0x4444444444444444444444444444444444444444' },
        // no domain
      }),
    );
    expect(r.summary).toBe('Transfer on unknown contract');
    expect(r.appName).toBeNull();
    expect(r.chainId).toBeNull();
    expect(r.contract).toBeNull();
  });

  it('returns the invalid sentinel for invalid parse input', () => {
    const r = describeTypedData({ valid: false });
    expect(r.summary).toBe('Invalid typed data');
    expect(r.fields).toEqual([]);
  });

  it('is deterministic: identical input yields a deeply-equal description', () => {
    const a = describeTypedData(parseTypedData(MAIL_TYPED_DATA));
    const b = describeTypedData(parseTypedData(MAIL_TYPED_DATA));
    expect(a).toEqual(b);
  });
});

describe('describeTypedData — nested struct/array fields render readably (no "[object Object]")', () => {
  // The HIGHEST-risk signatures (Permit2, Seaport) carry their dangerous detail
  // in NESTED structs/arrays. Rendering them as "[object Object]" in the signing
  // prompt hides exactly what the user is authorising — a "plain-language risk
  // before signing" failure. These exercise the real render (behavioural, not
  // a source-grep), and lock in that flat primitives are unaffected.

  it('renders a nested Permit2 `details` object, not "[object Object]"', () => {
    const parsed = parseTypedData({
      types: {
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      },
      primaryType: 'PermitSingle',
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      message: {
        details: {
          token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '1461501637330902918203684832716283019655932542975', // max uint160
          expiration: 1900000000,
          nonce: 0,
        },
        spender: '0x2222222222222222222222222222222222222222',
      },
    });
    const details = describeTypedData(parsed).fields.find((f) => f.name === 'details');
    expect(details.value).not.toContain('[object Object]');
    // The security-relevant inner fields must be visible in the prompt:
    expect(details.value).toContain('token');
    expect(details.value).toContain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    // …and the big amount must survive without precision loss:
    expect(details.value).toContain('1461501637330902918203684832716283019655932542975');
  });

  it('renders a Seaport-style array of offer items, not "[object Object]"', () => {
    const parsed = parseTypedData({
      types: {
        OrderComponents: [{ name: 'offer', type: 'OfferItem[]' }],
        OfferItem: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
      primaryType: 'OrderComponents',
      domain: { name: 'Seaport', chainId: 1, verifyingContract: '0x0000000000000068F116a894984e2DB1123eB395' },
      message: {
        offer: [
          { token: '0xAAAaAAAaAAAAAAaAaaAAAAAAAAaaaaAaAAAAAAaA', amount: '1000000000000000000' },
          { token: '0xBBbbbBBbBBbBBBbBBBbBBbbBBbbbBbbBBbBBbBBB', amount: '2' },
        ],
      },
    });
    const offer = describeTypedData(parsed).fields.find((f) => f.name === 'offer');
    expect(offer.value).not.toContain('[object Object]');
    expect(offer.value).toContain('0xAAAaAAAaAAAAAAaAaaAAAAAAAAaaaaAaAAAAAAaA');
    expect(offer.value).toContain('1000000000000000000');
  });

  it('still stringifies flat primitives unchanged (no regression)', () => {
    const r = describeTypedData(parseTypedData(makePermit()));
    // A type-max allowance is now flagged UNLIMITED, with the exact raw decimal preserved.
    expect(r.fields.find((f) => f.name === 'value').value).toContain('UNLIMITED');
    expect(r.fields.find((f) => f.name === 'value').value).toContain('115792089237316195423570985008687907853269984665640564039457584007913129639935');
    expect(r.fields.find((f) => f.name === 'nonce').value).toBe('0');
    expect(typeof r.fields.find((f) => f.name === 'nonce').value).toBe('string');
  });
});
