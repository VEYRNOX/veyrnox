// src/wallet-core/evm/__tests__/typed-data.nestedAuthority.test.js
//
// Audit 2026-09-07 L-7 — the structural authority backstop must survive a WRAPPER.
//
// `detectAssetAuthorising`'s named allowlists (Permit/Permit2/Seaport) are a
// denylist-by-omission whose fall-through is silent signing. The structural
// backstop exists so a type NOBODY enumerated still scores as asset-authorising
// when it hands an address-typed spender/operator/delegate to a third party.
//
// It used to inspect only the PRIMARY struct's own fields, so the one shape it
// most needed to catch walked straight past: a wrapper whose authority lives one
// level down (`SignedOrder { order: OrderComponents, sig }`, Safe's `SafeTx`).
// No lying about the type graph was required — H-4 reconciliation was satisfied.
//
// Mutation-checked: reverting grantsAddressAuthority to a flat `fields.some(...)`
// reds the nested and array cases and leaves the flat + negative cases green.

import { describe, it, expect } from 'vitest';
import { detectAssetAuthorising, parseTypedData } from '@/wallet-core/evm/typed-data.js';

const DOMAIN = { name: 'X', version: '1', chainId: 1, verifyingContract: '0x' + '11'.repeat(20) };

function build(types, primaryType, message = {}) {
  return parseTypedData(JSON.stringify({ types, primaryType, domain: DOMAIN, message }));
}

const EIP712_DOMAIN = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

describe('typed-data — structural authority backstop walks nested structs (L-7)', () => {
  it('flags a WRAPPER whose authority sits one level down', () => {
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      // The wrapper itself grants nothing; `inner` does.
      SignedOrder: [
        { name: 'order', type: 'OrderDetail' },
        { name: 'sig', type: 'bytes' },
      ],
      OrderDetail: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    }, 'SignedOrder');
    expect(parsed.valid).toBe(true);
    expect(detectAssetAuthorising(parsed).isAssetAuthorising).toBe(true);
  });

  it('flags authority reached through an ARRAY of structs', () => {
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      BatchThing: [{ name: 'items', type: 'Item[]' }],
      Item: [{ name: 'operator', type: 'address' }],
    }, 'BatchThing');
    expect(detectAssetAuthorising(parsed).isAssetAuthorising).toBe(true);
  });

  it('still flags the flat case it always caught (no regression)', () => {
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      Whatever: [
        { name: 'delegate', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    }, 'Whatever');
    expect(detectAssetAuthorising(parsed).isAssetAuthorising).toBe(true);
  });

  it('does NOT flag benign nested typed data — the over-blocking guard', () => {
    // A DAO vote / SIWE-style login signs fine today and authorises nothing. On
    // this surface asset-authorising means REFUSED, so a false positive here
    // breaks legitimate signing. `owner`/`from` are NOT authorising names.
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      Vote: [
        { name: 'proposal', type: 'Proposal' },
        { name: 'support', type: 'bool' },
      ],
      Proposal: [
        { name: 'id', type: 'uint256' },
        { name: 'author', type: 'address' },
      ],
    }, 'Vote');
    expect(detectAssetAuthorising(parsed).isAssetAuthorising).toBe(false);
  });

  // The two cases below were originally written as "the recursion guard stops a
  // cyclic graph". They did not test that: a cyclic graph never reaches
  // grantsAddressAuthority at all, because H-4's root reconciliation rejects it
  // first. The self-referential case was passing VACUOUSLY — invalid parse →
  // isAssetAuthorising false — which looks identical to the guard working.
  // Rewritten to assert the real defence, and to say where it lives.

  it('a self-referential type is rejected by H-4 before the backstop sees it', () => {
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      Node: [{ name: 'next', type: 'Node' }, { name: 'value', type: 'uint256' }],
    }, 'Node');
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toMatch(/type graph/i);
  });

  it('a mutually-recursive graph is rejected the same way, authority or not', () => {
    // B carries a real `spender`, so this is the case where a cycle would have
    // been worth smuggling. It never parses: a cycle leaves no single
    // unreferenced struct for the root derivation to land on.
    const parsed = build({
      EIP712Domain: EIP712_DOMAIN,
      A: [{ name: 'b', type: 'B' }],
      B: [{ name: 'a', type: 'A' }, { name: 'spender', type: 'address' }],
    }, 'A');
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toMatch(/type graph/i);
  });
});
