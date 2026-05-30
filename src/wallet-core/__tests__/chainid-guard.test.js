// wallet-core/__tests__/chainid-guard.test.js
//
// Phase C verification gate: the chainId-verify guard must reject a send when the
// connected provider is on a DIFFERENT chain than intended — for EVERY chain, not
// just Ethereum. A wrong chainId is consensus-critical (wrong-network send /
// replay), so this proves the defense-in-depth check in send.js fires per chain.
//
// The provider is mocked so no RPC/network access is required: we hand the send
// path a fake provider that reports a chosen chainId and assert the guard's
// behavior. (Real on-chain transfers are verified manually per testnet before any
// chain flips to `live`.)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the provider module BEFORE importing the code under test.
vi.mock('../evm/provider.js', () => ({
  getProvider: vi.fn(),
}));

import { getProvider } from '../evm/provider.js';
import { signAndBroadcast } from '../evm/send.js';

const VALID_PK = '0x' + '1'.repeat(64); // valid secp256k1 scalar; never a real key
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// A minimal fake provider that simply reports a chainId. If execution ever gets
// past the guard, the missing tx methods make sendTransaction fail with a
// NON-"wrong network" error — which is exactly how we prove the guard passed.
function providerReporting(chainId) {
  return {
    getNetwork: async () => ({ chainId: BigInt(chainId) }),
  };
}

const CHAINS = [
  { key: 'sepolia',         chainId: 11155111 },
  { key: 'polygonAmoy',     chainId: 80002 },
  { key: 'arbitrumSepolia', chainId: 421614 },
  { key: 'optimismSepolia', chainId: 11155420 },
  { key: 'avalancheFuji',   chainId: 43113 },
  { key: 'bnbTestnet',      chainId: 97 },
];

describe('chainId-verify guard rejects a mismatched network per chain', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const c of CHAINS) {
    it(`${c.key}: REJECTS a provider on the wrong chainId before broadcast`, async () => {
      // Provider reports a different chainId than the intended network.
      getProvider.mockReturnValue(providerReporting(c.chainId + 1));
      await expect(
        signAndBroadcast({ networkKey: c.key, privateKey: VALID_PK, to: TO, amountEth: '0.001' })
      ).rejects.toThrow(/wrong network/i);
    });

    it(`${c.key}: a MATCHING provider passes the chainId guard`, async () => {
      // Matching chainId clears the guard; the send then fails for an unrelated
      // reason on the fake provider — proving the guard was not the rejecter.
      getProvider.mockReturnValue(providerReporting(c.chainId));
      await expect(
        signAndBroadcast({ networkKey: c.key, privateKey: VALID_PK, to: TO, amountEth: '0.001' })
      ).rejects.not.toThrow(/wrong network/i);
    });
  }

  it('rejects an invalid recipient address before touching the network', async () => {
    getProvider.mockReturnValue(providerReporting(11155111));
    await expect(
      signAndBroadcast({ networkKey: 'sepolia', privateKey: VALID_PK, to: 'not-an-address', amountEth: '1' })
    ).rejects.toThrow(/invalid recipient/i);
  });
});
