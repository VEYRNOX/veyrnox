// Finding H7 — EIP-712 domain.chainId must match the WalletConnect session chain.
//
// A dApp on a Sepolia (eip155:11155111) WC session can supply a typed-data
// payload whose domain.chainId is mainnet (1). If the wallet signs against the
// dApp-supplied domain without binding it to the SESSION chain, the dApp obtains
// a mainnet-valid Permit/Permit2 signature — a cross-chain drain. The signing
// path must reject (fail closed, I4) on any mismatch BEFORE the key is touched.
//
// We assert machine CODES/structure, not prose copy (codes are the contract).

import { describe, it, expect } from 'vitest';
import { checkTypedDataChainId } from '../typed-data.js';

const SEPOLIA_CAIP2 = 'eip155:11155111';
const SEPOLIA_NUM = 11155111;

describe('checkTypedDataChainId — H7 cross-chain Permit binding', () => {
  it('passes when domain.chainId matches the session chain (numeric)', () => {
    const r = checkTypedDataChainId({ domain: { chainId: SEPOLIA_NUM } }, SEPOLIA_CAIP2);
    expect(r.ok).toBe(true);
    expect(r.code).toBe('CHAINID_OK');
  });

  it('passes when domain.chainId matches the session chain (hex string)', () => {
    const r = checkTypedDataChainId({ domain: { chainId: '0xaa36a7' } }, SEPOLIA_CAIP2);
    expect(r.ok).toBe(true);
    expect(r.code).toBe('CHAINID_OK');
  });

  it('REJECTS a mainnet domain.chainId on a Sepolia session (cross-chain drain)', () => {
    const r = checkTypedDataChainId({ domain: { chainId: 1 } }, SEPOLIA_CAIP2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CHAINID_MISMATCH');
    expect(r.expected).toBe(SEPOLIA_NUM);
    expect(r.got).toBe(1);
  });

  it('REJECTS when domain.chainId is absent (fail closed — cannot bind)', () => {
    const r = checkTypedDataChainId({ domain: {} }, SEPOLIA_CAIP2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CHAINID_MISSING');
  });

  it('REJECTS when the session chain id is unparseable (fail closed)', () => {
    const r = checkTypedDataChainId({ domain: { chainId: 1 } }, 'not-a-caip2');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SESSION_CHAINID_INVALID');
  });
});
