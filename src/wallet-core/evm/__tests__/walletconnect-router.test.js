import { describe, it, expect } from 'vitest';
import { classifyRequest, isBlocked, REQUEST_TYPES, SUPPORTED_CHAIN_IDS } from '../walletconnect/router.js';

describe('classifyRequest', () => {
  it('classifies eth_sendTransaction', () => {
    expect(classifyRequest('eth_sendTransaction')).toBe(REQUEST_TYPES.SEND_TRANSACTION);
  });
  it('classifies personal_sign', () => {
    expect(classifyRequest('personal_sign')).toBe(REQUEST_TYPES.PERSONAL_SIGN);
  });
  it('classifies eth_signTypedData_v4 as SIGN_TYPED_DATA (the only safe variant)', () => {
    expect(classifyRequest('eth_signTypedData_v4')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
  });
  // audit-H6: v1 and v3 use different encodings that cannot safely route to the v4
  // handler — they are blocked and classified as SIGN_TYPED_DATA_UNSUPPORTED.
  it('classifies eth_signTypedData (no version / v1) as SIGN_TYPED_DATA_UNSUPPORTED', () => {
    expect(classifyRequest('eth_signTypedData')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA_UNSUPPORTED);
  });
  it('classifies eth_signTypedData_v3 as SIGN_TYPED_DATA_UNSUPPORTED', () => {
    expect(classifyRequest('eth_signTypedData_v3')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA_UNSUPPORTED);
  });
  it('classifies eth_sign as ETH_SIGN (blocked variant)', () => {
    expect(classifyRequest('eth_sign')).toBe(REQUEST_TYPES.ETH_SIGN);
  });
  it('classifies wallet_switchEthereumChain', () => {
    expect(classifyRequest('wallet_switchEthereumChain')).toBe(REQUEST_TYPES.SWITCH_CHAIN);
  });
  it('classifies wallet_addEthereumChain', () => {
    expect(classifyRequest('wallet_addEthereumChain')).toBe(REQUEST_TYPES.ADD_CHAIN);
  });
  it('returns UNKNOWN for unrecognised methods', () => {
    expect(classifyRequest('eth_getBalance')).toBe(REQUEST_TYPES.UNKNOWN);
    expect(classifyRequest('wallet_getSnaps')).toBe(REQUEST_TYPES.UNKNOWN);
  });
});

describe('isBlocked', () => {
  it('blocks eth_sign (raw bytes — too dangerous)', () => {
    expect(isBlocked('eth_sign')).toBe(true);
  });
  it('blocks wallet_addEthereumChain (arbitrary RPC injection)', () => {
    expect(isBlocked('wallet_addEthereumChain')).toBe(true);
  });
  it('blocks wallet_switchEthereumChain (not yet implemented)', () => {
    expect(isBlocked('wallet_switchEthereumChain')).toBe(true);
  });
  // audit-H6: v1/v3 encoding cannot safely route to v4 handler
  it('blocks eth_signTypedData (v1/no-version — encoding mismatch with v4 handler)', () => {
    expect(isBlocked('eth_signTypedData')).toBe(true);
  });
  it('blocks eth_signTypedData_v3 (encoding differences — cannot safely route to v4)', () => {
    expect(isBlocked('eth_signTypedData_v3')).toBe(true);
  });
  it('does not block eth_signTypedData_v4 (the only safely handled variant)', () => {
    expect(isBlocked('eth_signTypedData_v4')).toBe(false);
  });
  it('does not block personal_sign', () => {
    expect(isBlocked('personal_sign')).toBe(false);
  });
  it('does not block eth_sendTransaction', () => {
    expect(isBlocked('eth_sendTransaction')).toBe(false);
  });
});

describe('SUPPORTED_CHAIN_IDS', () => {
  it('includes Sepolia testnet', () => {
    expect(SUPPORTED_CHAIN_IDS.has(11155111)).toBe(true);
  });
  it('includes Ethereum mainnet', () => {
    expect(SUPPORTED_CHAIN_IDS.has(1)).toBe(true);
  });
  it('does not include random chain IDs', () => {
    expect(SUPPORTED_CHAIN_IDS.has(99999)).toBe(false);
  });
});
