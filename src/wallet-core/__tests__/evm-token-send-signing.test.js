// wallet-core/__tests__/evm-token-send-signing.test.js
//
// Phase B ERC-20 CONSTRUCTION + SIGNING verification (network-free).
//
// erc20.test.js pins the calldata/scaling (buildTokenTransfer) and the registry
// guard. This file proves the deeper property for the path the UI actually signs
// (sendToken): the SIGNED bytes are a `transfer(recipient, amount)` call to the
// correct TOKEN CONTRACT, carrying 0 ETH value, the right chainId, the user's fee,
// and recovering to the sender. It also proves the on-chain decimals() cross-check
// fires BEFORE signing — a wrong-decimals contract must abort, never scale by 10^n.
//
// HOW: the provider is mocked so ethers signs LOCALLY and we capture the signed tx
// at broadcast; provider.call answers the contract's decimals() read with a chosen
// value. No RPC. Real on-chain token sends are still verified by hand per testnet
// before USDC/USDT flip to `live`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../evm/provider.js', () => ({
  getProvider: vi.fn(),
}));

import { Wallet, Transaction, Interface, AbiCoder, parseUnits, getAddress } from 'ethers';
import { getProvider } from '../evm/provider.js';
import { sendToken } from '../evm/token-send.js';
import { getToken, ERC20_ABI } from '../evm/tokens.js';

const PK = '0x' + '2'.repeat(64); // valid secp256k1 scalar; NOT a real-funds key
const SIGNER = new Wallet(PK).address;
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SEPOLIA_CHAINID = 11155111;

const erc20 = new Interface(ERC20_ABI);
const abi = AbiCoder.defaultAbiCoder();

const FEE = {
  maxFeePerGasWei: '3000000000',        // 3 gwei
  maxPriorityFeePerGasWei: '1500000000', // 1.5 gwei
  gasLimit: '65000',                     // typical ERC-20 transfer budget
};

// Fake provider: signs locally + captures broadcast; answers decimals() via call().
// `decimalsAnswer` lets a test simulate a contract whose on-chain decimals disagree
// with the pinned registry value (the mismatch guard).
function makeFakeProvider(chainId, capture, decimalsAnswer) {
  return {
    getNetwork: async () => ({ chainId: BigInt(chainId), name: `test-${chainId}` }),
    getTransactionCount: async () => 3,
    // ethers Contract.decimals() -> signer.call() -> provider.call(); return uint8.
    call: async () => abi.encode(['uint8'], [decimalsAnswer]),
    broadcastTransaction: async (signedTx) => {
      capture.raw = signedTx;
      const parsed = Transaction.from(signedTx);
      return { hash: parsed.hash, wait: async () => ({ status: 1 }) };
    },
  };
}

describe('ERC-20 construction + signing — signed bytes are a transfer to the right token', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const symbol of ['USDC', 'USDT']) {
    const token = getToken('sepolia', symbol);

    it(`${symbol}: signs transfer(${TO.slice(0, 8)}…, amount) to the verified contract with 6-dec scaling`, async () => {
      const capture = {};
      // Contract reports the SAME decimals as the pinned registry (6) — happy path.
      getProvider.mockReturnValue(makeFakeProvider(SEPOLIA_CHAINID, capture, token.decimals));

      const amount = '12.5';
      const res = await sendToken({
        networkKey: 'sepolia',
        privateKey: PK,
        symbol,
        to: TO,
        amount,
        fee: FEE,
      });

      const tx = Transaction.from(capture.raw);

      // It targets the TOKEN CONTRACT, not the recipient, and moves 0 ETH.
      expect(getAddress(tx.to)).toBe(getAddress(token.address));
      expect(tx.value).toBe(0n);
      // The calldata is EXACTLY transfer(recipient, amount) scaled at 6 decimals —
      // an 18-dec bug would encode 10^12 too much.
      const expectedData = erc20.encodeFunctionData('transfer', [TO, parseUnits(amount, 6)]);
      expect(tx.data).toBe(expectedData);
      // Decode back to be unambiguous about recipient + base-unit amount.
      const [decodedTo, decodedAmt] = erc20.decodeFunctionData('transfer', tx.data);
      expect(getAddress(decodedTo)).toBe(getAddress(TO));
      expect(decodedAmt).toBe(12_500_000n); // 12.5 * 10^6

      // EIP-1559, correct chain, user-selected fee, recovers to the sender.
      expect(tx.type).toBe(2);
      expect(tx.chainId).toBe(BigInt(SEPOLIA_CHAINID));
      expect(tx.maxFeePerGas).toBe(BigInt(FEE.maxFeePerGasWei));
      expect(tx.maxPriorityFeePerGas).toBe(BigInt(FEE.maxPriorityFeePerGasWei));
      expect(tx.gasLimit).toBe(BigInt(FEE.gasLimit));
      expect(getAddress(tx.from)).toBe(getAddress(SIGNER));

      expect(res.hash).toBe(tx.hash);
      expect(res.explorerUrl).toContain(tx.hash);
    });

    it(`${symbol}: ABORTS before signing if the on-chain decimals disagree with the registry`, async () => {
      const capture = {};
      // Contract lies: reports 18 decimals while the registry pins 6. Must throw,
      // never scale the amount by the wrong power of ten, never broadcast.
      getProvider.mockReturnValue(makeFakeProvider(SEPOLIA_CHAINID, capture, 18));
      await expect(
        sendToken({ networkKey: 'sepolia', privateKey: PK, symbol, to: TO, amount: '1', fee: FEE })
      ).rejects.toThrow(/decimals mismatch/i);
      expect(capture.raw).toBeUndefined(); // nothing signed/broadcast
    });
  }

  it('rejects an invalid recipient before touching the network or signing', async () => {
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(SEPOLIA_CHAINID, capture, 6));
    await expect(
      sendToken({ networkKey: 'sepolia', privateKey: PK, symbol: 'USDC', to: 'not-an-address', amount: '1', fee: FEE })
    ).rejects.toThrow(/invalid recipient/i);
    expect(capture.raw).toBeUndefined();
  });
});
