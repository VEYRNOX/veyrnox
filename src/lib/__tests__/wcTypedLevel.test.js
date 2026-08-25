// M-5 (2026-07-28 internal audit): scoreWcTypedDataLevel unit tests.
//
// Anchors the risk plane the pre-sign gate composes for eth_signTypedData_v4.
// See src/lib/wcTypedLevel.js and src/lib/WalletConnectProvider.jsx
// _handleSignTypedData.

import { describe, it, expect } from 'vitest';
import { scoreWcTypedDataLevel } from '@/lib/wcTypedLevel';
import { LEVEL } from '@/risk/levels';

const eip2612Domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 1,
  verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

function permit({ value }) {
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
    domain: eip2612Domain,
    message: {
      owner: '0x1111111111111111111111111111111111111111',
      spender: '0x2222222222222222222222222222222222222222',
      value,
      nonce: '0',
      deadline: '1900000000',
    },
  };
}

const MAX_UINT256 = ((1n << 256n) - 1n).toString();
const MAX_UINT160 = ((1n << 160n) - 1n).toString();

describe('scoreWcTypedDataLevel', () => {
  it('OK on a non-asset-authorising typed message', () => {
    const td = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
        Mail: [{ name: 'contents', type: 'string' }],
      },
      primaryType: 'Mail',
      domain: { name: 'Hello' },
      message: { contents: 'hi' },
    };
    expect(scoreWcTypedDataLevel(td)).toBe(LEVEL.OK);
  });

  it('CAUTION on a bounded EIP-2612 Permit (small allowance)', () => {
    expect(scoreWcTypedDataLevel(permit({ value: '1000000' }))).toBe(LEVEL.CAUTION);
  });

  it('RISK on an unlimited EIP-2612 Permit (uint256 max)', () => {
    expect(scoreWcTypedDataLevel(permit({ value: MAX_UINT256 }))).toBe(LEVEL.RISK);
  });

  it('RISK on a near-max EIP-2612 Permit (inside unlimited band)', () => {
    const nearMax = ((1n << 256n) - 2n).toString();
    expect(scoreWcTypedDataLevel(permit({ value: nearMax }))).toBe(LEVEL.RISK);
  });

  it('RISK on a Permit2 PermitSingle regardless of allowance shape', () => {
    const permit2 = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
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
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x0' },
      message: {
        details: {
          token: '0x0000000000000000000000000000000000000001',
          amount: '1',
          expiration: '1900000000',
          nonce: '0',
        },
        spender: '0x2222222222222222222222222222222222222222',
        sigDeadline: '1900000000',
      },
    };
    expect(scoreWcTypedDataLevel(permit2)).toBe(LEVEL.RISK);
  });

  it('RISK on a Permit2 PermitBatch with an unlimited (uint160 max) amount nested in details[]', () => {
    const permit2Batch = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
        ],
      },
      primaryType: 'PermitBatch',
      domain: { name: 'Permit2' },
      message: {
        details: [
          { token: '0x1', amount: '1' },
          { token: '0x2', amount: MAX_UINT160 },
        ],
        spender: '0xdead',
      },
    };
    expect(scoreWcTypedDataLevel(permit2Batch)).toBe(LEVEL.RISK);
  });

  it('accepts stringified JSON input (WC dApps send strings)', () => {
    const json = JSON.stringify(permit({ value: MAX_UINT256 }));
    expect(scoreWcTypedDataLevel(json)).toBe(LEVEL.RISK);
  });

  it('CAUTION on malformed / unparseable input (fail-closed, I4)', () => {
    expect(scoreWcTypedDataLevel('{not json')).toBe(LEVEL.CAUTION);
    expect(scoreWcTypedDataLevel(null)).toBe(LEVEL.CAUTION);
    expect(scoreWcTypedDataLevel({})).toBe(LEVEL.CAUTION);
    expect(scoreWcTypedDataLevel({ primaryType: 'Permit' })).toBe(LEVEL.CAUTION);
  });

  // H-4 (2026-08-25): a canonical Permit struct declared under a benign
  // primaryType scored LEVEL.OK, because both this scorer and
  // detectAssetAuthorising key off the dApp-declared string while ethers signs
  // the Permit typehash derived from `types`. parseTypedData now rejects the
  // payload, so the un-scoreable body lands on the fail-closed CAUTION branch.
  it('CAUTION (never OK) when primaryType does not match the declared type graph', () => {
    const masquerade = { ...permit({ value: MAX_UINT256 }), primaryType: 'Vote' };
    expect(scoreWcTypedDataLevel(masquerade)).toBe(LEVEL.CAUTION);
    expect(scoreWcTypedDataLevel(JSON.stringify(masquerade))).toBe(LEVEL.CAUTION);
  });

  it('CAUTION on Seaport marketplace orders (asset-authorising but not permit-shape)', () => {
    const seaport = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
        OrderComponents: [{ name: 'offerer', type: 'address' }],
      },
      primaryType: 'OrderComponents',
      domain: { name: 'Seaport' },
      message: { offerer: '0x1111111111111111111111111111111111111111' },
    };
    expect(scoreWcTypedDataLevel(seaport)).toBe(LEVEL.CAUTION);
  });
});
