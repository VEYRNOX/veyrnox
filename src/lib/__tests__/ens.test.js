// src/lib/__tests__/ens.test.js
//
// Unit tests for on-chain ENS resolution helper (src/lib/ens.js).
// The ethers Contract constructor is mocked so no real RPC is needed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveEnsName } from '../ens.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const RESOLVER_ADDR = '0x4976fb03C32e5B8cfe2b6cFB0B78F7497B1f8E2A';

const mockRegistryResolver = vi.fn();
const mockResolverAddr = vi.fn();

// Only override Contract — import namehash from the real ethers so the hash
// behaviour is genuine without pulling in the full module.
vi.mock('ethers', async () => {
  const { namehash } = await vi.importActual('ethers');
  return {
    namehash,
    Contract: class {
      constructor(address) {
        if (address.toLowerCase() === '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e') {
          return { resolver: mockRegistryResolver };
        }
        return { addr: mockResolverAddr };
      }
    },
  };
});

describe('resolveEnsName', () => {
  const mockProvider = {};

  beforeEach(() => {
    mockRegistryResolver.mockResolvedValue(RESOLVER_ADDR);
    mockResolverAddr.mockResolvedValue(VITALIK);
  });

  it('returns the address for a resolvable ENS name', async () => {
    expect(await resolveEnsName(mockProvider, 'vitalik.eth')).toBe(VITALIK);
  });

  it('returns null when no resolver is registered (zero address from registry)', async () => {
    mockRegistryResolver.mockResolvedValue(ZERO);
    expect(await resolveEnsName(mockProvider, 'unregistered.eth')).toBeNull();
  });

  it('returns null when the resolver has no addr record (zero addr)', async () => {
    mockResolverAddr.mockResolvedValue(ZERO);
    expect(await resolveEnsName(mockProvider, 'no-addr.eth')).toBeNull();
  });

  it('propagates RPC errors so the caller can show a toast', async () => {
    mockRegistryResolver.mockRejectedValue(new Error('RPC timeout'));
    await expect(resolveEnsName(mockProvider, 'vitalik.eth')).rejects.toThrow('RPC timeout');
  });
});
