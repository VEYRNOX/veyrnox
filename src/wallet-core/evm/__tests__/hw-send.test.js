// wallet-core/evm/__tests__/hw-send.test.js
//
// Audit finding M-2 / issue #746: the hardware-wallet signing modules shipped
// with ZERO unit coverage. The single highest-risk operation in evm/hw-send.js
// is SIGNATURE RECONSTRUCTION: the device returns only {v, r, s}, and the module
// rebuilds a broadcastable EIP-1559 (type-2) tx from those three values. A wrong
// `v` (recovery id) would otherwise silently produce a tx that recovers to the
// WRONG sender. The module now guards this: it recovers the sender from the
// reconstructed signature and throws HW_SIGNER_MISMATCH before broadcast (I4).
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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Wallet, Transaction, parseEther, getAddress } from 'ethers';
import { setDeniabilitySession } from '../../deniabilitySession.js';
import * as deniabilityModule from '../../deniabilitySession.js';

// Shared holders the hoisted mocks delegate to. Set per-test.
const h = vi.hoisted(() => ({
  ledgerSign: null, trezorSign: null,
  // 2026-07-14 audit LOW: hw-send now pre-verifies device.getAddress against the
  // caller-supplied fromAddress (parity with the post-sign recovery guard).
  ledgerAddress: null, trezorGetAddress: null,
}));

// Mock the provider so buildUnsignedEvmTx / broadcast never touch the network.
vi.mock('../provider.js', () => ({ getProvider: vi.fn() }));

// hw-app-eth default export is a class: `new Eth(transport)` → .signTransaction().
vi.mock('@ledgerhq/hw-app-eth', () => ({
  default: class MockEth {
    constructor(transport) { this.transport = transport; }
    async getAddress(_path) { return { address: h.ledgerAddress ?? null }; }
    async signTransaction(path, rawTxHex, resolution) {
      return h.ledgerSign(path, rawTxHex, resolution);
    }
  },
}));

// TrezorConnect default export: object with ethereumGetAddress() + ethereumSignTransaction().
vi.mock('@trezor/connect-web', () => ({
  default: {
    ethereumGetAddress: (...args) => h.trezorGetAddress(...args),
    ethereumSignTransaction: (...args) => h.trezorSign(...args),
  },
}));

import { getProvider } from '../provider.js';
import { signAndBroadcastEvmLedger, signAndBroadcastEvmTrezor, signAndBroadcastEvmTrezorToken } from '../hw-send.js';

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
    // 2026-07-14 audit LOW: preflight now DELETES overrides.gasLimit on estimateGas
    // throw (drop the hinted 21000 so ethers re-estimates and surfaces the revert
    // reason). Provide a small real estimate here so the user-supplied FEE.gasLimit
    // (21000) wins the max() clamp (estimate 17000 + 20% headroom = 20400 < 21000).
    estimateGas: async () => 17_000n,
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
  beforeEach(() => {
    vi.clearAllMocks();
    h.ledgerSign = null; h.trezorSign = null;
    // 2026-07-14 audit LOW: pre-sign getAddress must match fromAddress to reach signFn.
    h.ledgerAddress = FROM;
    h.trezorGetAddress = async () => ({ success: true, payload: { address: FROM } });
  });

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

  // BELT-AND-SUSPENDERS GUARD (M-2 / #746): the module recovers the sender from
  // the reconstructed signature and asserts it equals the expected fromAddress
  // BEFORE broadcast. A device (or transport bug) returning the WRONG recovery
  // id would otherwise yield a broadcastable tx that silently recovers to a
  // DIFFERENT address. This test pins the guard: flipped `v` → throw with
  // code HW_SIGNER_MISMATCH, and the raw tx never reaches the provider (I4).
  it('fail-closed (I4): flipped recovery id trips the recovered-sender guard — throws, nothing broadcast', async () => {
    const capture = {};
    const provider = makeFakeProvider(capture);
    const broadcastSpy = vi.spyOn(provider, 'broadcastTransaction');
    getProvider.mockReturnValue(provider);
    h.ledgerSign = async (_path, rawTxHex) => {
      const { sig, v } = deviceSign(rawTxHex, 'yParity');
      const flipped = (parseInt(v, 16) ^ 1).toString(16); // wrong yParity
      return { v: flipped, r: sig.r.slice(2), s: sig.s.slice(2) };
    };

    await expect(signAndBroadcastEvmLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM,
      to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toMatchObject({ code: 'HW_SIGNER_MISMATCH' });

    // Fail-closed means fail BEFORE egress: no broadcast attempt, no raw tx out.
    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(capture.raw).toBeUndefined();
  });
});

describe('evm/hw-send — Trezor signature reconstruction (M-2 / #746)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ledgerSign = null; h.trezorSign = null;
    // 2026-07-14 audit LOW: pre-sign getAddress must match fromAddress to reach signFn.
    h.ledgerAddress = FROM;
    h.trezorGetAddress = async () => ({ success: true, payload: { address: FROM } });
  });

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

  it('fail-closed (I4): flipped recovery id trips the recovered-sender guard — throws, nothing broadcast', async () => {
    const capture = {};
    const provider = makeFakeProvider(capture);
    const broadcastSpy = vi.spyOn(provider, 'broadcastTransaction');
    getProvider.mockReturnValue(provider);
    h.trezorSign = async ({ transaction }) => {
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
      const flipped = (sig.yParity ^ 1).toString(16); // wrong yParity
      return { success: true, payload: { v: flipped, r: sig.r, s: sig.s } };
    };

    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toMatchObject({ code: 'HW_SIGNER_MISMATCH' });

    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(capture.raw).toBeUndefined();
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

  // Issue #961 (SEND H-1): the UI Trezor branch previously called
  // provider.getTransactionCount(addr) with the default block-tag "latest",
  // colliding with any tx sitting in the mempool, and skipped the sanity
  // window. The audited hw-send path MUST use 'pending' AND enforce
  // 0 <= n <= 1_000_000 (mirrors evm/send.js:52-55).
  it('fetches nonce with the "pending" block tag (issue #961)', async () => {
    const capture = {};
    const provider = makeFakeProvider(capture);
    const nonceSpy = vi.spyOn(provider, 'getTransactionCount');
    getProvider.mockReturnValue(provider);
    h.trezorSign = async ({ transaction }) => {
      const unsigned = Transaction.from({
        to: transaction.to, value: BigInt(transaction.value),
        chainId: Number(transaction.chainId), nonce: Number(transaction.nonce),
        type: 2, data: '0x',
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      return { success: true, payload: { v: sig.yParity.toString(16), r: sig.r, s: sig.s } };
    };

    await signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    });

    expect(nonceSpy).toHaveBeenCalledWith(FROM, 'pending');
  });

  it('fail-closed (I4): implausible nonce (2^32) throws before signing (issue #961)', async () => {
    const capture = {};
    const provider = {
      send: async (m) => (m === 'eth_chainId' ? '0x' + CHAIN_ID.toString(16) : undefined),
      estimateGas: async () => { throw new Error('no estimate'); },
      getTransactionCount: async () => 4_294_967_296, // 2^32 — outside 0..1_000_000
      broadcastTransaction: async (raw) => { capture.raw = raw; return { hash: '0x', wait: async () => ({}) }; },
    };
    getProvider.mockReturnValue(provider);
    h.trezorSign = vi.fn();

    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/implausible nonce/i);

    expect(h.trezorSign).not.toHaveBeenCalled();
    expect(capture.raw).toBeUndefined();
  });
});

// Issue #961 (SEND H-1): the ERC-20 Trezor branch on the UI hardcoded gasLimit
// to 65000n. The audited helper MUST estimate gas + apply +20% headroom
// (mirrors sendToken in token-send.js). Also inherits: HW_SIGNER_MISMATCH
// on wrong recovery id, 'pending' block-tag nonce, sanity window.
describe('evm/hw-send — Trezor ERC-20 helper (issue #961 / SEND H-1)', () => {
  const SYMBOL = 'USDC';
  // Address of SEPOLIA_USDC per tokens.js registry — buildTokenTransfer resolves via getToken.
  const SEPOLIA_USDC_ADDR = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const TOKEN_AMOUNT = '1.5'; // 6 dp OK

  // A fake provider for the token path: estimateGas RETURNS a value (60000n)
  // so applyEstimatedGasLimit can produce a non-hardcoded gasLimit (72000n
  // after +20% headroom). This is the property test (c) — the signed tx's
  // gasLimit must be derived from estimateGas, not the old 65000n constant.
  function makeTokenProvider(capture) {
    return {
      send: async (m) => (m === 'eth_chainId' ? '0x' + CHAIN_ID.toString(16) : undefined),
      estimateGas: vi.fn(async (req) => { capture.estimateReq = req; return 60000n; }),
      getTransactionCount: vi.fn(async () => 11),
      broadcastTransaction: async (signedTx) => {
        capture.raw = signedTx;
        const parsed = Transaction.from(signedTx);
        return { hash: parsed.hash, wait: async () => ({ status: 1 }) };
      },
    };
  }

  beforeEach(() => { vi.clearAllMocks(); h.ledgerSign = null; h.trezorSign = null; });

  it('signs an ERC-20 transfer that recovers to the signer and commits to calldata + contract', async () => {
    const capture = {};
    getProvider.mockReturnValue(makeTokenProvider(capture));
    h.trezorSign = async ({ transaction }) => {
      const unsigned = Transaction.from({
        to: transaction.to, value: BigInt(transaction.value),
        chainId: Number(transaction.chainId), nonce: Number(transaction.nonce),
        type: 2, data: transaction.data,
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      return { success: true, payload: { v: sig.yParity.toString(16), r: sig.r, s: sig.s } };
    };

    // No fee.gasLimit — the helper MUST estimate + apply +20% headroom.
    const FEE_TOKEN = {
      maxFeePerGasWei: '2000000000',
      maxPriorityFeePerGasWei: '1000000000',
    };

    const res = await signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: TO, amount: TOKEN_AMOUNT, fee: FEE_TOKEN,
    });

    const tx = Transaction.from(capture.raw);
    // ERC-20: `to` is the token CONTRACT, value=0, data starts with transfer() selector.
    expect(getAddress(tx.to)).toBe(getAddress(SEPOLIA_USDC_ADDR));
    expect(tx.value).toBe(0n);
    expect(tx.data.startsWith('0xa9059cbb')).toBe(true);
    // Property (c): gasLimit derived from estimateGas(60000n) + 20% = 72000n.
    // Explicitly NOT the old hardcoded 65000n.
    expect(tx.gasLimit).toBe(72000n);
    expect(tx.gasLimit).not.toBe(65000n);
    // Recovers to the signer (I4).
    expect(getAddress(tx.from)).toBe(getAddress(FROM));
    expect(res.hash).toBe(tx.hash);
  });

  it('property (c): applyEstimatedGasLimit is exercised — estimateGas called with token calldata', async () => {
    const capture = {};
    const provider = makeTokenProvider(capture);
    getProvider.mockReturnValue(provider);
    h.trezorSign = async ({ transaction }) => {
      const unsigned = Transaction.from({
        to: transaction.to, value: BigInt(transaction.value),
        chainId: Number(transaction.chainId), nonce: Number(transaction.nonce),
        type: 2, data: transaction.data,
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      return { success: true, payload: { v: sig.yParity.toString(16), r: sig.r, s: sig.s } };
    };

    await signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: TO, amount: TOKEN_AMOUNT, fee: { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' },
    });

    expect(provider.estimateGas).toHaveBeenCalled();
    // estimateGas MUST have been called with the token calldata (transfer selector) and
    // the contract as `to` — otherwise it would return 21000 for a bare call to an EOA.
    expect(capture.estimateReq.to.toLowerCase()).toBe(SEPOLIA_USDC_ADDR.toLowerCase());
    expect(capture.estimateReq.data.startsWith('0xa9059cbb')).toBe(true);
    expect(capture.estimateReq.value).toBe(0n);
  });

  it('property (a): flipped recovery id trips HW_SIGNER_MISMATCH — nothing broadcast (I4)', async () => {
    const capture = {};
    const provider = makeTokenProvider(capture);
    const broadcastSpy = vi.spyOn(provider, 'broadcastTransaction');
    getProvider.mockReturnValue(provider);
    h.trezorSign = async ({ transaction }) => {
      const unsigned = Transaction.from({
        to: transaction.to, value: BigInt(transaction.value),
        chainId: Number(transaction.chainId), nonce: Number(transaction.nonce),
        type: 2, data: transaction.data,
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      const flipped = (sig.yParity ^ 1).toString(16);
      return { success: true, payload: { v: flipped, r: sig.r, s: sig.s } };
    };

    await expect(signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: TO, amount: TOKEN_AMOUNT,
      fee: { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' },
    })).rejects.toMatchObject({ code: 'HW_SIGNER_MISMATCH' });

    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(capture.raw).toBeUndefined();
  });

  it('property (b): fetches nonce with "pending" block tag', async () => {
    const capture = {};
    const provider = makeTokenProvider(capture);
    getProvider.mockReturnValue(provider);
    h.trezorSign = async ({ transaction }) => {
      const unsigned = Transaction.from({
        to: transaction.to, value: BigInt(transaction.value),
        chainId: Number(transaction.chainId), nonce: Number(transaction.nonce),
        type: 2, data: transaction.data,
        gasLimit: BigInt(transaction.gasLimit),
        maxFeePerGas: BigInt(transaction.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
      });
      const sig = wallet.signingKey.sign(unsigned.unsignedHash);
      return { success: true, payload: { v: sig.yParity.toString(16), r: sig.r, s: sig.s } };
    };

    await signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: TO, amount: TOKEN_AMOUNT,
      fee: { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' },
    });

    expect(provider.getTransactionCount).toHaveBeenCalledWith(FROM, 'pending');
  });

  it('property (b): implausible nonce (2^32) throws before signing (I4)', async () => {
    const provider = {
      send: async (m) => (m === 'eth_chainId' ? '0x' + CHAIN_ID.toString(16) : undefined),
      estimateGas: async () => 60000n,
      getTransactionCount: async () => 4_294_967_296,
      broadcastTransaction: vi.fn(),
    };
    getProvider.mockReturnValue(provider);
    h.trezorSign = vi.fn();

    await expect(signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: TO, amount: TOKEN_AMOUNT,
      fee: { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' },
    })).rejects.toThrow(/implausible nonce/i);

    expect(h.trezorSign).not.toHaveBeenCalled();
    expect(provider.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid recipient before any device call (fail-closed)', async () => {
    getProvider.mockReturnValue(makeTokenProvider({}));
    h.trezorSign = vi.fn();
    await expect(signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: SYMBOL,
      to: '0xnot-an-address', amount: TOKEN_AMOUNT,
      fee: { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' },
    })).rejects.toThrow(/invalid recipient/i);
    expect(h.trezorSign).not.toHaveBeenCalled();
  });
});

// Issue #972 (post-#963 hotfix): PR #963 moved the Trezor EVM flow into hw-send.js
// but DID NOT carry over the I3 deniability gate that lived in the old
// hw/trezor.js requireWebUsb() → checkDeniability() at entry. Under a decoy /
// hidden / stealth session, hw-send would now hit the RPC (provider.send,
// provider.estimateGas, provider.getTransactionCount) AND prompt the physical
// device AND potentially broadcast — a direct I3 violation and a coercion-time
// hazard.
//
// This suite pins the gate: with isDeniabilitySessionActive()===true, every
// hardware-wallet public entrypoint MUST throw before ANY provider read or
// device call. The error class is Error and the code / message match the old
// hw/trezor.js exactly ('TREZOR_DENIABILITY_BLOCKED') so downstream UI catches
// remain identical.
describe('evm/hw-send — I3 deniability gate (issue #972, post-#963 hotfix)', () => {
  const FEE_MIN = { maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1000000000' };

  beforeEach(() => {
    vi.clearAllMocks();
    h.ledgerSign = null;
    h.trezorSign = null;
    setDeniabilitySession(true);
  });
  afterEach(() => { setDeniabilitySession(false); });

  it('signAndBroadcastEvmTrezor throws TREZOR_DENIABILITY_BLOCKED before any RPC or device call', async () => {
    const providerSpy = { send: vi.fn(), estimateGas: vi.fn(), getTransactionCount: vi.fn(), broadcastTransaction: vi.fn() };
    getProvider.mockReturnValue(providerSpy);
    h.trezorSign = vi.fn();

    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/TREZOR_DENIABILITY_BLOCKED/);

    expect(providerSpy.send).not.toHaveBeenCalled();
    expect(providerSpy.estimateGas).not.toHaveBeenCalled();
    expect(providerSpy.getTransactionCount).not.toHaveBeenCalled();
    expect(providerSpy.broadcastTransaction).not.toHaveBeenCalled();
    expect(h.trezorSign).not.toHaveBeenCalled();
  });

  it('signAndBroadcastEvmTrezorToken throws TREZOR_DENIABILITY_BLOCKED before any RPC or device call', async () => {
    const providerSpy = { send: vi.fn(), estimateGas: vi.fn(), getTransactionCount: vi.fn(), broadcastTransaction: vi.fn() };
    getProvider.mockReturnValue(providerSpy);
    h.trezorSign = vi.fn();

    await expect(signAndBroadcastEvmTrezorToken({
      networkKey: NETWORK, fromAddress: FROM, symbol: 'USDC',
      to: TO, amount: '1.5', fee: FEE_MIN,
    })).rejects.toThrow(/TREZOR_DENIABILITY_BLOCKED/);

    expect(providerSpy.send).not.toHaveBeenCalled();
    expect(providerSpy.estimateGas).not.toHaveBeenCalled();
    expect(providerSpy.getTransactionCount).not.toHaveBeenCalled();
    expect(providerSpy.broadcastTransaction).not.toHaveBeenCalled();
    expect(h.trezorSign).not.toHaveBeenCalled();
  });

  it('signAndBroadcastEvmLedger throws TREZOR_DENIABILITY_BLOCKED before any RPC or device call (symmetry)', async () => {
    const providerSpy = { send: vi.fn(), estimateGas: vi.fn(), getTransactionCount: vi.fn(), broadcastTransaction: vi.fn() };
    getProvider.mockReturnValue(providerSpy);
    h.ledgerSign = vi.fn();

    await expect(signAndBroadcastEvmLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/TREZOR_DENIABILITY_BLOCKED/);

    expect(providerSpy.send).not.toHaveBeenCalled();
    expect(providerSpy.estimateGas).not.toHaveBeenCalled();
    expect(providerSpy.getTransactionCount).not.toHaveBeenCalled();
    expect(providerSpy.broadcastTransaction).not.toHaveBeenCalled();
    expect(h.ledgerSign).not.toHaveBeenCalled();
  });

  // TODO(#972 followup): add coverage for the demo-flag branch of
  // assertNotDeniabilitySession (localStorage `veyrnox-demo`=='1'). The source
  // fix matches the OLD hw/trezor.js:deniabilityActive() verbatim, so runtime
  // behaviour parity is high-confidence — but a proper unit test needs
  // localStorage stubbing that this file's mock harness doesn't provide today.

  // Codex second-pass finding (issue #972 P2, round 2). If the deniability
  // helper itself throws — e.g. localStorage is unavailable or the session
  // module crashes — assertNotDeniabilitySession must still fail CLOSED (treat
  // as active) rather than let the send through. Post-round-3, hw-send.js
  // delegates the whole check to isDeniabilityOrDemoActive which already fails
  // closed on internal exceptions; we prove the composite still refuses when
  // the shared helper is forced to throw.
  it('fails closed when the shared deniability helper throws (I4 belt-and-braces)', async () => {
    setDeniabilitySession(false);  // baseline session inactive
    const throwingSpy = vi.spyOn(deniabilityModule, 'isDeniabilityOrDemoActive')
      .mockImplementation(() => { throw new Error('helper crashed'); });

    const providerSpy = { send: vi.fn(), estimateGas: vi.fn(), getTransactionCount: vi.fn(), broadcastTransaction: vi.fn() };
    getProvider.mockReturnValue(providerSpy);
    h.trezorSign = vi.fn();

    // assertNotDeniabilitySession lets the helper's throw propagate; the send
    // path never reaches the RPC or the device.
    await expect(signAndBroadcastEvmTrezor({
      networkKey: NETWORK, fromAddress: FROM, to: TO, amountEth: '0.01', fee: FEE,
    })).rejects.toThrow(/helper crashed/);

    expect(providerSpy.send).not.toHaveBeenCalled();
    expect(providerSpy.estimateGas).not.toHaveBeenCalled();
    expect(providerSpy.getTransactionCount).not.toHaveBeenCalled();
    expect(providerSpy.broadcastTransaction).not.toHaveBeenCalled();
    expect(h.trezorSign).not.toHaveBeenCalled();

    throwingSpy.mockRestore();
  });
});
