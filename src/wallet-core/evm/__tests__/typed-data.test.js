import { describe, it, expect } from 'vitest';
import { parseTypedData, detectAssetAuthorising, describeTypedData } from '../typed-data.js';

const PERMIT = {
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: { name: 'DAI', chainId: 11155111, verifyingContract: '0xabc' },
  primaryType: 'Permit',
  message: { owner: '0x111', spender: '0x222', value: '1000000000000000000', nonce: 0, deadline: 9999999999 },
};

const PERMIT2 = {
  types: {
    PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }],
    PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }],
  },
  domain: { name: 'Permit2', verifyingContract: '0xCCC' },
  primaryType: 'PermitSingle',
  message: { details: { token: '0xTKN', amount: '1000' }, spender: '0xDEF' },
};

const TYPED_TRANSFER = {
  types: { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  domain: { name: 'MyApp' },
  primaryType: 'Transfer',
  message: { to: '0xABC', amount: '500' },
};

describe('parseTypedData', () => {
  it('accepts a raw object', () => {
    const r = parseTypedData(PERMIT);
    expect(r.valid).toBe(true);
    expect(r.primaryType).toBe('Permit');
  });
  it('accepts a JSON string', () => {
    const r = parseTypedData(JSON.stringify(PERMIT));
    expect(r.valid).toBe(true);
  });
  it('returns valid:false on garbage JSON', () => {
    expect(parseTypedData('not json').valid).toBe(false);
  });
  it('returns valid:false when primaryType missing', () => {
    expect(parseTypedData({ types: {}, domain: {}, message: {} }).valid).toBe(false);
  });
});

describe('detectAssetAuthorising', () => {
  it('flags Permit as asset-authorising', () => {
    const r = detectAssetAuthorising(parseTypedData(PERMIT));
    expect(r.isAssetAuthorising).toBe(true);
    expect(r.kind).toBe('permit');
    expect(r.reason).toMatch(/Permit/);
  });
  it('flags PermitSingle (Permit2) as asset-authorising', () => {
    const r = detectAssetAuthorising(parseTypedData(PERMIT2));
    expect(r.isAssetAuthorising).toBe(true);
    expect(r.kind).toBe('permit');
  });
  it('does not flag a plain Transfer type', () => {
    const r = detectAssetAuthorising(parseTypedData(TYPED_TRANSFER));
    expect(r.isAssetAuthorising).toBe(false);
  });
  it('does not flag invalid typed data', () => {
    const r = detectAssetAuthorising({ valid: false });
    expect(r.isAssetAuthorising).toBe(false);
  });
});

describe('describeTypedData', () => {
  it('returns primaryType and domain name in summary', () => {
    const r = describeTypedData(parseTypedData(PERMIT));
    expect(r.summary).toContain('Permit');
    expect(r.summary).toContain('DAI');
    expect(r.appName).toBe('DAI');
    expect(r.chainId).toBe(11155111);
    expect(r.contract).toBe('0xabc');
  });
  it('returns fields as name/value pairs', () => {
    const r = describeTypedData(parseTypedData(PERMIT));
    const spender = r.fields.find(f => f.name === 'spender');
    expect(spender.value).toBe('0x222');
  });
  it('returns summary for invalid data', () => {
    const r = describeTypedData({ valid: false });
    expect(r.summary).toBe('Invalid typed data');
    expect(r.fields).toEqual([]);
  });
});
