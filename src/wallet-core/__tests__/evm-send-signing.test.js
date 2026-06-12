// wallet-core/__tests__/evm-send-signing.test.js
//
// Phase C per-chain CONSTRUCTION + SIGNING verification (network-free).
//
// chainid-guard.test.js proves the PRE-broadcast guard rejects a wrong-chain
// provider. This file proves the complementary, deeper property: that the bytes
// signAndBroadcast actually SIGNS commit to the right chainId, recipient, value,
// and fee — i.e. signature-level replay protection per chain. A tx signed for
// Arbitrum Sepolia must carry chainId 421614 in the signature so it can NEVER be
// replayed on Optimism Sepolia (11155420), and must recover to the sender.
//
// HOW: the provider is mocked with a fake that lets ethers sign LOCALLY (real
// secp256k1) and captures the serialized signed tx at broadcast — no RPC. We then
// parse the captured raw tx with ethers.Transaction.from() and assert every
// consensus-critical field, including the recovered `from` (which only matches if
// the signature commits to exactly those fields). Real on-chain sends are still
// verified by hand per testnet before any chain flips to `live`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the provider module BEFORE importing the code under test. getNetwork()
// (the real registry) is intentionally NOT mocked — so the fake provider's
// reported chainId must MATCH the real registry value or send.js's guard throws,
// making this test a cross-check against networks.js too.
vi.mock('../evm/provider.js', () => ({
  getProvider: vi.fn(),
}));

import { Wallet, Transaction, parseEther, getAddress } from 'ethers';
import { getProvider } from '../evm/provider.js';
import { signAndBroadcast } from '../evm/send.js';

const PK = '0x' + '1'.repeat(64); // valid secp256k1 scalar; NOT a real-funds key
const SIGNER = new Wallet(PK).address;
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// A user-selected EIP-1559 fee. Because send.js spreads evmFeeOverrides(fee) into
// sendTransaction, these EXACT values must appear in the signed bytes — proving
// "what you pick is what gets signed" and avoiding any getFeeData/estimateGas RPC.
const FEE = {
  maxFeePerGasWei: '2000000000',        // 2 gwei
  maxPriorityFeePerGasWei: '1000000000', // 1 gwei
  gasLimit: '21000',
};

// chainIds VERIFIED against ethereum-lists/chains (same fixture discipline as
// networks.test.js). sepolia is the already-on-chain-verified control; the rest
// are the native-coin EVM chains under verification. Note polygonAmoy / avalanche
// Fuji / bnbTestnet pay gas in POL / AVAX / tBNB (not ETH) — but that is a UI
// LABEL concern (networks.js symbol); the SIGNED bytes are identical EIP-1559
// fields regardless, which is exactly what this test pins.
const CHAINS = [
  { key: 'sepolia',         chainId: 11155111, role: 'verified control' },
  { key: 'arbitrumSepolia', chainId: 421614,   role: 'under verification' },
  { key: 'optimismSepolia', chainId: 11155420, role: 'under verification' },
  { key: 'polygonAmoy',     chainId: 80002,    role: 'under verification' },
  { key: 'avalancheFuji',   chainId: 43113,    role: 'under verification' },
  { key: 'bnbTestnet',      chainId: 97,        role: 'under verification' },
];

// Fake provider: lets ethers populate + sign locally, captures the signed raw tx
// at broadcast. Reports `chainId` for both send.js's guard and ethers' chainId
// fill. Nonce is fixed; fees/gas are supplied via overrides so no estimate RPC is
// needed. broadcastTransaction returns a minimal TransactionResponse-like object.
function makeFakeProvider(chainId, capture) {
  return {
    getNetwork: async () => ({ chainId: BigInt(chainId), name: `test-${chainId}` }),
    getTransactionCount: async () => 7, // arbitrary fixed nonce
    broadcastTransaction: async (signedTx) => {
      capture.raw = signedTx;
      const parsed = Transaction.from(signedTx);
      return { hash: parsed.hash, wait: async () => ({ status: 1 }) };
    },
  };
}

describe('EVM construction + signing — signed bytes commit to the right chain', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const c of CHAINS) {
    it(`${c.key} (${c.role}): signs a tx that recovers to the sender with the correct chainId/to/value/fee`, async () => {
      const capture = {};
      getProvider.mockReturnValue(makeFakeProvider(c.chainId, capture));

      const res = await signAndBroadcast({
        networkKey: c.key,
        privateKey: PK,
        to: TO,
        amountEth: '0.0123',
        fee: FEE,
      });

      // A real signed tx was produced and broadcast.
      expect(capture.raw).toMatch(/^0x[0-9a-f]+$/i);
      const tx = Transaction.from(capture.raw);

      // EIP-1559 (type-2) tx.
      expect(tx.type).toBe(2);
      // chainId is baked into the SIGNED bytes — this is the per-chain replay guard.
      expect(tx.chainId).toBe(BigInt(c.chainId));
      // recipient + value are exactly what was requested.
      expect(getAddress(tx.to)).toBe(getAddress(TO));
      expect(tx.value).toBe(parseEther('0.0123'));
      // the user-selected fee is what got signed (not an RPC auto-fill).
      expect(tx.maxFeePerGas).toBe(BigInt(FEE.maxFeePerGasWei));
      expect(tx.maxPriorityFeePerGas).toBe(BigInt(FEE.maxPriorityFeePerGasWei));
      expect(tx.gasLimit).toBe(BigInt(FEE.gasLimit));
      // The signature recovers to OUR key — only true if it commits to exactly the
      // fields above (chainId included). This is the cryptographic proof, not a label.
      expect(getAddress(tx.from)).toBe(getAddress(SIGNER));

      // The returned handle carries the real (locally-computed) hash + explorer URL.
      expect(res.hash).toBe(tx.hash);
      expect(res.explorerUrl).toContain(tx.hash);
    });
  }

  it('a tx signed for Arbitrum Sepolia is NOT valid on Optimism Sepolia (distinct signed chainId)', async () => {
    // Sign the SAME logical transfer on both chains and prove the signed chainId —
    // and therefore the signature/hash — differ, so neither can be replayed on the
    // other. This is the cross-chain replay property made concrete.
    const arb = {};
    getProvider.mockReturnValue(makeFakeProvider(421614, arb));
    await signAndBroadcast({ networkKey: 'arbitrumSepolia', privateKey: PK, to: TO, amountEth: '0.5', fee: FEE });

    const op = {};
    getProvider.mockReturnValue(makeFakeProvider(11155420, op));
    await signAndBroadcast({ networkKey: 'optimismSepolia', privateKey: PK, to: TO, amountEth: '0.5', fee: FEE });

    const arbTx = Transaction.from(arb.raw);
    const opTx = Transaction.from(op.raw);
    expect(arbTx.chainId).toBe(421614n);
    expect(opTx.chainId).toBe(11155420n);
    expect(arbTx.chainId).not.toBe(opTx.chainId);
    // Different signed chainId => different signature => different tx hash.
    expect(arbTx.hash).not.toBe(opTx.hash);
    // Both still recover to the same owner — each is individually valid on ITS chain.
    expect(getAddress(arbTx.from)).toBe(getAddress(SIGNER));
    expect(getAddress(opTx.from)).toBe(getAddress(SIGNER));
  });

  it('still rejects a mismatched provider chainId before signing (guard intact under this harness)', async () => {
    // Defense-in-depth belt: even with a real-signing harness, a provider on the
    // wrong chain is refused before any bytes are signed/broadcast.
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(11155111 /* sepolia */, capture));
    await expect(
      signAndBroadcast({ networkKey: 'arbitrumSepolia', privateKey: PK, to: TO, amountEth: '0.1', fee: FEE })
    ).rejects.toThrow(/wrong network/i);
    expect(capture.raw).toBeUndefined(); // nothing was signed/broadcast
  });
});
