// wallet-core/evm/__tests__/hw-send.test.js
//
// Audit finding M-2 / issue #746: the hardware-wallet signing modules shipped
// with ZERO unit coverage. The single highest-risk operation in evm/hw-send.js
// is SIGNATURE RECONSTRUCTION: the device returns only {v, r, s}, and the module
// rebuilds a broadcastable EIP-1559 (type-2) tx from those three values. A wrong
// `v` (recovery id) silently produces a tx that recovers to the WRONG sender —
// it still broadcasts, but from an address the user does not control, so funds
// move from nowhere / the tx is rejected by the network, with no local error.
//
// WHAT THIS PROVES (network-free): given a device {v, r, s} over the exact
// unsigned bytes the module built, the reconstructed tx (a) round-trips through
// ethers.Transaction.from and (b) RECOVERS to the real signer — the cryptographic
// proof that the reassembled signature commits to the intended chainId / to /
// value / fee. Covers both Ledger's yParity (0/1) and 27/28 `v` encodings, since
// the module funnels both through parseInt(v,16) → Signature.from, which must
// normalise them identically.
//
// HOW: the "device" is a mock that signs the module's own unsigned bytes with a
// throwaway ethers Wallet (real secp256k1, NOT a real-funds key) and hands back
// {v, r, s} in the wire shape hw-app-eth / TrezorConnect return. The provider is
// mocked so nothing hits the network. We then parse the broadcast raw tx and
// assert getAddress(tx.from) === the throwaway wallet.
//
// SCOPE / HONESTY: passing here is BUILT-level evidence only — it verifies the
// reconstruction MATH against a software signer. It does NOT substitute for a
// real Ledger/Trezor device confirming a testnet txid on a block explorer (the
// catalogue "verified" bar). The physical device transport + the device's own
// {v,r,s} wire encoding remain device-gated.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Wallet, Transaction, parseEther, getAddress } from 'ethers';

// Shared holders the hoisted mocks delegate to. Set per-test.
const h = vi.hoisted(() => ({ ledgerSign: null, trezorSign: null }));

// Mock the provider so buildUnsignedEvmTx / broadcast never touch the network.
vi.mock('../provider.js', () => ({ getProvider: vi.fn() }));

// hw-app-eth default export is a class: `new Eth(transport)` → .signTransaction().
vi.mock('@ledgerhq/hw-app-eth', () => ({
  default: class MockEth {
    constructor(transport) { this.transport = transport; }
    async signTransaction(path, rawTxHex, resolution) {
      return h.ledgerSign(path, rawTxHex, resolution);
    }
  },
}));

// TrezorConnect default export: object with ethereumSignTransaction().
vi.mock('@trezor/connect-web', () => ({
  default: { ethereumSignTransaction: (...args) => h.trezorSign(...args) },
}));

import { getProvider } from '../provider.js';
import { signAndBroadcastEvmLedger, signAndBroadcastEvmTrezor } from '../hw-send.js';

const PK = '0x' + '1'.repeat(64); // valid secp256k1 scalar; NOT a real-funds key
const wallet = new Wallet(PK);
const FROM = wallet.address;
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NETWORK = 'sepolia';
const CHAIN_ID = 11155111;

// User-selected fee → because hw-send spreads evmFeeOverrides(fee) into the
// unsigned tx, these EXACT values must appear in the signed bytes.
const FEE = {
  maxFeePerGasWei: '2000000000',        // 2 gwei
  maxPriorityFeePerGasWei: '1000000000', // 1 gwei
  gasLimit: '21000',
};

// Fake provider: verifyLiveChainId reads eth_chainId; applyEstimatedGasLimit
// calls estimateGas (we reject it so the fee-override gasLimit is kept verbatim,
// keeping the signed bytes deterministic); getTransactionCount fixes the nonce;
// broadcastTransaction captures the signed raw tx.
function makeFakeProvider(capture) {
  return {
    send: async (method) => (method === 'eth_chainId' ? '0x' + CHAIN_ID.toString(16) : undefined),
    estimateGas: async () => { throw new Error('no estimate in test — keep override'); },
    getTransactionCount: async () => 7,
    broadcastTransaction: async (signedTx) => {
      capture.raw = signedTx;
      const parsed = Transaction.from(signedTx);
      return { hash: parsed.hash, wait: async () => ({ status: 1 }) };
    },
  };
}

// Given the raw unsigned type-2 hex the module handed the "device", sign it with
// the throwaway wallet and return {v, r, s} in the requested `v` encoding.
//   vFormat 'yParity' → v ∈ {'0','1'}  (Ledger EIP-1559 style)
//   vFormat 'legacy'  → v ∈ {'1b','1c'} (27/28 style)
function deviceSign(rawTxHexNo0x, vFormat = 'yParity') {
  const tx = Transaction.from('0x' + rawTxHexNo0x);
  const sig = wallet.signingKey.sign(tx.unsignedHash);
  const v = vFormat === 'legacy'
    ? (27 + sig.yParity).toString(16) // '1b' | '1c'
    : sig.yParity.toString(16);       // '0'  | '1'
  return { sig, v };
}

describe('evm/hw-send — Ledger signature reconstruction (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.ledgerSign = null; h.trezorSign = null; });

  for (const vFormat of ['yParity', 'legacy']) {
    it(`recovers to the signer with v encoded as ${vFormat}`, async () => {
      const capture = {};
      getProvider.mockReturnValue(makeFakeProvider(capture));
      h.ledgerSign = async (_path, rawTxHex) => {
        const { sig, v } = deviceSign(rawTxHex, vFormat);
        // hw-app-eth returns v/r/s as hex strings WITHOUT the 0x prefix.
        return { v, r: sig.r.slice(2), s: sig.s.slice(2) };
      };

      const res = await signAndBroadcastEvmLedger({
        transport: {}, networkKey: NETWORK, fromAddress: FROM,
        to: TO, amountEth: '0.0123', fee: FEE,
      });

      expect(capture.raw).toMatch(/^0x[0-9a-f]+$/i);
      const tx = Transaction.from(capture.raw);
      expect(tx.type).toBe(2);
      expect(tx.chainId).toBe(BigInt(CHAIN_ID));
      expect(getAddress(tx.to)).toBe(getAddress(TO));
      expect(tx.value).toBe(parseEther('0.0123'));
      expect(tx.maxFeePerGas).toBe(BigInt(FEE.maxFeePerGasWei));
      expect(tx.maxPriorityFeePerGas).toBe(BigInt(FEE.maxPriorityFeePerGasWei));
      expect(tx.gasLimit).toBe(BigInt(FEE.gasLimit));
      // The cryptographic proof: the reassembled signature recovers to OUR key,
      // which is only true if v/r/s were rebuilt over exactly these fields.
      expect(getAddress(tx.from)).toBe(getAddress(FROM));
      expect(res.hash).toBe(tx.hash);
      expect(res.explorerUrl).toContain(tx.hash);
    });
  }

  // FRAGILITY NOTE (not a defect the module must fix, but worth pinning): the
  // module performs NO post-reconstruction recovery check. If a device (or a
  // future transport bug) returned the WRONG recovery id, the tx still serialises
  // and broadcasts — it simply recovers to a DIFFERENT address. This test proves
  // that a flipped `v` is silently accepted, documenting the missing belt-and-
  // suspenders assertion (a recover-equals-fromAddress guard would fail closed).
  it('does NOT catch a flipped recovery id — reconstructs a tx that recovers to a different address', async () => {
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(capture));
    h.ledgerSign = async (_path, rawTxHex) => {
      const { sig, v } = deviceSign(rawTxHex, 'yParity');
      const flipped = (parseInt(v, 16) ^ 1).toString(16); // wrong yParity
      return { v: flipped, r: sig.r.slice(2), s: sig.s.slice(2) };
    };

    await signAndBroadcastEvmLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM,
      to: TO, amountEth: '0.01', fee: FEE,
    });

    const tx = Transaction.from(capture.raw);
    // A broadcastable tx was produced, but it recovers to the WRONG signer and
    // the module raised no error — the exact silent-mis-sign hazard M-2 flags.
    expect(getAddress(tx.from)).not.toBe(getAddress(FROM));
  });
});

describe('evm/hw-send — Trezor signature reconstruction (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.ledgerSign = null; h.trezorSign = null; });

  it('recovers to the signer and commits to the requested fee/to/value/chainId', async () => {
    const capture = {};
    getProvider.mockReturnValue(makeFakeProvider(capture));
    h.trezorSign = async ({ transaction }) => {
      // Rebuild the same unsigned tx Trezor would sign, from the fields the
      // module passed, then sign with the throwaway wallet.
      const unsigned = Transaction.from({
        to: transaction.to,
        value: BigInt(transaction.value),
        chainId: Number(transaction.chainId),
        nonce: Number(transaction.nonce),
        type: 2,
        data: '0x',
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      // TrezorConnect returns r/s WITH 0x, v as a hex string.
      return { success: true, payload: { v: sig.yParity.toString(16), r: sig.r, s: sig.s } };
    };

    const res = await signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.0123', fee: FEE,
    });

    const tx = Transaction.from(capture.raw);
    expect(tx.type).toBe(2);
    expect(tx.chainId).toBe(BigInt(CHAIN_ID));
    expect(getAddress(tx.to)).toBe(getAddress(TO));
    expect(tx.value).toBe(parseEther('0.0123'));
    expect(tx.maxFeePerGas).toBe(BigInt(FEE.maxFeePerGasWei));
    expect(getAddress(tx.from)).toBe(getAddress(FROM));
    expect(res.hash).toBe(tx.hash);
  });

  it('throws when the device reports failure (fail-closed, I4)', async () => {
    getProvider.mockReturnValue(makeFakeProvider({}));
    h.trezorSign = async () => ({ success: false, payload: { error: 'User cancelled' } });
    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/cancel/i);
  });

  it('rejects an invalid recipient before any device call (fail-closed)', async () => {
    getProvider.mockReturnValue(makeFakeProvider({}));
    h.trezorSign = vi.fn();
    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: '0xnot-an-address', amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/invalid recipient/i);
    expect(h.trezorSign).not.toHaveBeenCalled();
  });
});
