// H-4 (2026-08-25 weekly audit; first reported 2026-08-17 as H-1) — the
// dApp-declared `primaryType` was accepted as an opaque string and never
// reconciled with the `types` graph it is supposed to name.
//
// Every Veyrnox protection on the typed-data path is a NAME match on that
// string: `detectAssetAuthorising` (the drain warning + the modal's mandatory
// acknowledgement checkbox) and `scoreWcTypedDataLevel` (the M-5 pre-sign risk
// plane). The signer never sees it — `wallet.signTypedData(domain, types,
// message)` takes no primaryType and ethers derives the real one from `types`
// as the single unreferenced struct.
//
// So a hostile dApp keeps a canonical `Permit` struct in `types`, the real
// token domain and an unlimited `value`, and declares `"primaryType": "Vote"`.
// ethers signs the EIP-2612 Permit typehash — a signature `permit()` accepts —
// while Veyrnox shows no warning, no checkbox, and scores LEVEL.OK.
//
// Fix is in `parseTypedData`: derive the roots of the declared graph and fail
// CLOSED (I4) on mismatch AND on ambiguity. These tests pin both the rejection
// and — just as important — that legitimate nested payloads (EIP-712 Mail,
// Permit2 with a `details` sub-struct, Seaport with `OfferItem[]`) still parse.

import { describe, it, expect } from 'vitest';
import { parseTypedData, detectAssetAuthorising } from '../typed-data.js';

const DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const PERMIT_FIELDS = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
];

// The attack payload, verbatim from the audit: canonical Permit struct, real
// USDC domain, unlimited allowance — with a benign-looking primaryType.
const MASQUERADING_PERMIT = {
  types: { EIP712Domain: DOMAIN_TYPE, Permit: PERMIT_FIELDS },
  primaryType: 'Vote',
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  message: {
    owner: '0x1111111111111111111111111111111111111111',
    spender: '0x2222222222222222222222222222222222222222',
    value: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    nonce: 0,
    deadline: 1900000000,
  },
};

describe('parseTypedData — primaryType is reconciled against the declared type graph (H-4)', () => {
  it('REJECTS a Permit masquerading under a benign primaryType', () => {
    const r = parseTypedData(MASQUERADING_PERMIT);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/primaryType/i);
  });

  it('rejects it identically when sent as a JSON string (the WC wire shape)', () => {
    expect(parseTypedData(JSON.stringify(MASQUERADING_PERMIT)).valid).toBe(false);
  });

  it('rejects a primaryType that names no declared struct at all', () => {
    const r = parseTypedData({
      types: { EIP712Domain: DOMAIN_TYPE, Mail: [{ name: 'contents', type: 'string' }] },
      primaryType: 'Ghost',
      message: { contents: 'hi' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejects an AMBIGUOUS graph — two unreferenced roots, even if one matches', () => {
    // ethers itself refuses this ("ambiguous primary types or unused types"),
    // so accepting it here would mean classifying a payload the signer will
    // never produce a signature for — or, worse, one whose root is not the
    // struct we warned about.
    const r = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        Vote: [{ name: 'proposal', type: 'uint256' }],
        Permit: PERMIT_FIELDS,
      },
      primaryType: 'Vote',
      message: { proposal: 1 },
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a primaryType of EIP712Domain (not a message struct)', () => {
    const r = parseTypedData({
      types: { EIP712Domain: DOMAIN_TYPE },
      primaryType: 'EIP712Domain',
      message: { name: 'x' },
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a self-referential (cycle) graph with no root, without throwing', () => {
    const r = parseTypedData({
      types: { EIP712Domain: DOMAIN_TYPE, Node: [{ name: 'next', type: 'Node' }] },
      primaryType: 'Node',
      message: { next: {} },
    });
    expect(r.valid).toBe(false);
  });

  it('fails closed on a malformed types entry instead of throwing', () => {
    for (const bad of [{ Permit: 'not-an-array' }, { Permit: 42 }, { Permit: null }]) {
      const r = parseTypedData({
        types: { EIP712Domain: DOMAIN_TYPE, ...bad },
        primaryType: 'Permit',
        message: { value: '1' },
      });
      expect(r.valid, JSON.stringify(bad)).toBe(false);
    }
  });

  it('the masquerading payload is never classified as asset-authorising either', () => {
    // Belt and braces: the parse rejection is what stops the signature (the WC
    // handler throws on !parsed.valid before withPrivateKey), but the
    // classifier must not claim anything about a payload we refused to trust.
    expect(detectAssetAuthorising(parseTypedData(MASQUERADING_PERMIT)).isAssetAuthorising)
      .toBe(false);
  });
});

describe('parseTypedData — legitimate payloads still parse (no false rejections)', () => {
  it('accepts the canonical EIP-712 Mail example (nested Person struct)', () => {
    const r = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' },
        ],
      },
      primaryType: 'Mail',
      domain: { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCcCcCccccccCCccCcccCCCC' },
      message: { from: {}, to: {}, contents: 'Hello, Bob!' },
    });
    expect(r.valid).toBe(true);
    expect(r.primaryType).toBe('Mail');
  });

  it('accepts a real Permit2 PermitSingle (sub-struct referenced by the root)', () => {
    const r = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      primaryType: 'PermitSingle',
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      message: { details: {}, spender: '0x2222222222222222222222222222222222222222', sigDeadline: '1900000000' },
    });
    expect(r.valid).toBe(true);
    expect(detectAssetAuthorising(r).isAssetAuthorising).toBe(true);
  });

  it('accepts array-typed references — Permit2 `PermitDetails[]` and Seaport `OfferItem[]`', () => {
    const batch = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }],
        PermitBatch: [{ name: 'details', type: 'PermitDetails[]' }, { name: 'spender', type: 'address' }],
      },
      primaryType: 'PermitBatch',
      domain: { name: 'Permit2' },
      message: { details: [], spender: '0xdead' },
    });
    expect(batch.valid).toBe(true);

    const seaport = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        OfferItem: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
        OrderComponents: [{ name: 'offer', type: 'OfferItem[]' }],
      },
      primaryType: 'OrderComponents',
      domain: { name: 'Seaport' },
      message: { offer: [] },
    });
    expect(seaport.valid).toBe(true);
  });

  it('accepts a fixed/multi-dimensional array reference (Seaport BulkOrder tree)', () => {
    const r = parseTypedData({
      types: {
        EIP712Domain: DOMAIN_TYPE,
        OrderComponents: [{ name: 'offerer', type: 'address' }],
        BulkOrder: [{ name: 'tree', type: 'OrderComponents[2][2]' }],
      },
      primaryType: 'BulkOrder',
      domain: { name: 'Seaport' },
      message: { tree: [] },
    });
    expect(r.valid).toBe(true);
  });

  it('accepts a struct with no fields (a bare root is unambiguous)', () => {
    const r = parseTypedData({ types: { EIP712Domain: [], Mail: [] }, primaryType: 'Mail', message: { from: '0x0' } });
    expect(r.valid).toBe(true);
  });
});
