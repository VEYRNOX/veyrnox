// wallet-core/__tests__/evm-broadcast-failure.test.js
//
// UNHAPPY PATH for the EVM money path: what happens AFTER the bytes are signed
// and the network says no.
//
// evm-send-signing.test.js pins the happy path — it mocks broadcastTransaction
// as always succeeding, so every assertion there is about the signed bytes. The
// complementary property, untested until now, is the FAILURE contract: when the
// RPC rejects the broadcast (nonce too low, insufficient funds, mempool/network
// error), signAndBroadcast must reject and surface the ORIGINAL error — never
// swallow it, never resolve with a half-built handle carrying an undefined hash.
// A swallowed broadcast error is the worst possible outcome in a wallet: the UI
// renders "sent", the user stops watching, and nothing was ever mined (I4 —
// fail honest, fail closed).
//
// Assertions are on machine CODES (`err.code`: NONCE_EXPIRED, INSUFFICIENT_FUNDS,
// NETWORK_ERROR) and on error IDENTITY (`toBe(injected)`), not on prose — an RPC
// can reword its message at any time, but a rewrapped/replaced error object is
// evidence the error passed through a catch that reinterpreted it.
//
// Same harness as evm-send-signing.test.js: the provider is faked so ethers signs
// LOCALLY with real secp256k1 and no RPC is ever contacted; only the broadcast
// step's outcome is varied.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the provider module BEFORE importing the code under test. getNetwork()
// (the real registry) is intentionally NOT mocked, so the fake provider's chainId
// must match the real registry value or send.js's pre-sign guard throws first.
vi.mock('../evm/provider.js', () => ({
  getProvider: vi.fn(),
}));

import { Wallet, Transaction, getAddress } from 'ethers';
import { getProvider } from '../evm/provider.js';
import { signAndBroadcast } from '../evm/send.js';

const PK = '0x' + '1'.repeat(64); // valid secp256k1 scalar; NOT a real-funds key
const SIGNER = new Wallet(PK).address;
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CHAIN_ID = 11155111; // sepolia — the already-on-chain-verified control

// User-selected EIP-1559 fee, supplied so no getFeeData/estimateGas RPC is needed
// (identical to evm-send-signing.test.js).
const FEE = {
  maxFeePerGasWei: '2000000000',        // 2 gwei
  maxPriorityFeePerGasWei: '1000000000', // 1 gwei
  gasLimit: '21000',
};

/**
 * Fake provider whose broadcast step is programmable.
 *
 * `onBroadcast(signedTx)` receives the locally-signed raw tx and decides the
 * outcome: throw (RPC rejected the tx) or return a TransactionResponse-like
 * object (optionally one whose wait() rejects). Everything before broadcast
 * behaves exactly as in the happy-path harness, so any rejection this test sees
 * provably originates at BROADCAST and not at an earlier guard.
 */
function makeFakeProvider(capture, onBroadcast) {
  return {
    getNetwork: async () => ({ chainId: BigInt(CHAIN_ID), name: `test-${CHAIN_ID}` }),
    send: async (method) => (method === 'eth_chainId' ? '0x' + CHAIN_ID.toString(16) : undefined),
    getTransactionCount: async () => 7, // arbitrary fixed nonce, inside the sanity window
    broadcastTransaction: async (signedTx) => {
      capture.raw = signedTx; // proves the bytes reached the broadcast step
      return onBroadcast(signedTx);
    },
  };
}

const send = () =>
  signAndBroadcast({
    networkKey: 'sepolia',
    privateKey: PK,
    to: TO,
    amountEth: '0.0123',
    fee: FEE,
  });

/** Await a promise and return { resolved, rejected } without letting vitest fail on the throw. */
async function settle(promise) {
  try {
    return { resolved: await promise, rejected: undefined, didReject: false };
  } catch (e) {
    return { resolved: undefined, rejected: e, didReject: true };
  }
}

describe('EVM signAndBroadcast — broadcast failure propagates, never silently succeeds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('propagates a "nonce too low" rejection unchanged (code NONCE_EXPIRED), returning no tx handle', async () => {
    // Classic re-broadcast/stale-nonce rejection. If this were swallowed the UI
    // would show a "sent" tx that no node ever accepted.
    const injected = Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' });
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(capture, () => { throw injected; }));

    const { resolved, rejected, didReject } = await settle(send());

    expect(didReject).toBe(true);
    // Identity, not message-matching: a rewrapped error means a catch reinterpreted it.
    expect(rejected).toBe(injected);
    expect(rejected.code).toBe('NONCE_EXPIRED');
    // No half-built handle: nothing that could be rendered as a successful send.
    expect(resolved).toBeUndefined();
    // The failure really did happen at broadcast — bytes were signed and offered.
    expect(capture.raw).toMatch(/^0x[0-9a-f]+$/i);
    expect(getAddress(Transaction.from(capture.raw).from)).toBe(getAddress(SIGNER));
  });

  it('propagates an "insufficient funds for gas * price + value" rejection (code INSUFFICIENT_FUNDS)', async () => {
    // The user cannot afford value+fee. Must surface as a rejection so the send
    // screen can show a real error rather than a fabricated pending state.
    const injected = Object.assign(
      new Error('insufficient funds for gas * price + value'),
      { code: 'INSUFFICIENT_FUNDS' },
    );
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(capture, () => { throw injected; }));

    const { resolved, rejected, didReject } = await settle(send());

    expect(didReject).toBe(true);
    expect(rejected).toBe(injected);
    expect(rejected.code).toBe('INSUFFICIENT_FUNDS');
    expect(resolved).toBeUndefined();
  });

  it('propagates a network-level rejection that carries NO message (code NETWORK_ERROR)', async () => {
    // Timeouts / socket resets can reject with an empty or message-less error. A
    // falsy `.message` must not be mistaken for "no error" anywhere on this path.
    const injected = Object.assign(new Error(''), { code: 'NETWORK_ERROR' });
    const capture = {};
    getProvider.mockReturnValue(
      makeFakeProvider(capture, () => Promise.reject(injected)),
    );

    const { resolved, rejected, didReject } = await settle(send());

    expect(didReject).toBe(true);
    expect(rejected).toBe(injected);
    expect(rejected.code).toBe('NETWORK_ERROR');
    expect(rejected.message).toBe('');
    expect(resolved).toBeUndefined();
  });

  it('propagates a non-Error rejection value (an RPC layer that rejects with a bare object)', async () => {
    // Defensive: `throw {}` / rejected non-Error must still reject rather than be
    // coerced into a resolved value by a truthiness check somewhere.
    const injected = { code: 'SERVER_ERROR', shortMessage: undefined };
    const capture = {};
    getProvider.mockReturnValue(
      makeFakeProvider(capture, () => Promise.reject(injected)),
    );

    const { resolved, rejected, didReject } = await settle(send());

    expect(didReject).toBe(true);
    expect(rejected).toBe(injected);
    expect(resolved).toBeUndefined();
  });

  it('a broadcast that succeeds but whose wait() rejects: the handle is honest and wait() rejects to the caller', async () => {
    // Broadcast accepted, confirmation failed (dropped from mempool / replaced /
    // reorg). The correct contract is: signAndBroadcast RESOLVES (the tx really
    // was accepted and has a real hash the user can look up), but the caller's
    // wait() must reject with the original error rather than resolve to a
    // fabricated receipt — otherwise the UI reports "confirmed" for a tx that
    // never confirmed. That is the silent-state-corruption case.
    const injected = Object.assign(new Error('transaction was replaced'), {
      code: 'TRANSACTION_REPLACED',
    });
    const capture = {};
    getProvider.mockReturnValue(
      makeFakeProvider(capture, (signedTx) => ({
        hash: Transaction.from(signedTx).hash,
        wait: async () => { throw injected; },
      })),
    );

    const res = await send();

    // The handle reports the REAL locally-computed hash of the broadcast bytes —
    // no placeholder, no fabricated id.
    const signed = Transaction.from(capture.raw);
    expect(res.hash).toBe(signed.hash);
    expect(res.explorerUrl).toContain(signed.hash);

    // wait() surfaces the failure unchanged; it must not resolve to a receipt.
    const { resolved, rejected, didReject } = await settle(res.wait());
    expect(didReject).toBe(true);
    expect(rejected).toBe(injected);
    expect(rejected.code).toBe('TRANSACTION_REPLACED');
    expect(resolved).toBeUndefined();
  });

  it('a wait() that resolves to a REVERTED receipt reports status 0 — it is not normalised into a success', async () => {
    // status: 0 means mined-and-reverted. The receipt must reach the caller with
    // status 0 intact so the UI can distinguish "mined" from "succeeded".
    const capture = {};
    getProvider.mockReturnValue(
      makeFakeProvider(capture, (signedTx) => ({
        hash: Transaction.from(signedTx).hash,
        wait: async () => ({ status: 0, hash: Transaction.from(signedTx).hash }),
      })),
    );

    const res = await send();
    const receipt = await res.wait();
    expect(receipt.status).toBe(0);
  });
});
