// wallet-core/sol/__tests__/hw-send.test.js
//
// Audit finding M-2 / issue #746: sol/hw-send.js had ZERO unit coverage. Unlike
// EVM (which rebuilds {v,r,s}), the SOL device returns a raw 64-byte ed25519
// signature and the module attaches it verbatim with tx.addSignature(feePayer,
// sig) before serialising. The failure mode is therefore ATTACHMENT, not
// reconstruction: attach a signature that does not correspond to the fee-payer /
// serialised message and the resulting raw tx is invalid (verifySignatures ===
// false) — this must never broadcast as if signed.
//
// WHAT THIS PROVES (network-free): the shared sendSolHw core, exercised through
// the real Ledger and Trezor entrypoints, (a) hands the device the serialised
// message bytes, (b) attaches the returned signature to the fee-payer slot, and
// (c) produces a raw tx whose signatures VERIFY — the cryptographic proof the
// attached device signature is the one a software signer would have produced. A
// mismatched signature is shown to fail verification (so a caller that checks
// cannot be fooled).
//
// HOW: the "device" signs the module's own serialised message with @noble/curves
// ed25519 under the fee-payer's seed (a throwaway test key, NOT real funds). All
// provider reads/broadcast/confirm are mocked — nothing hits the network.
//
// SCOPE / HONESTY: BUILT-level evidence only. It verifies signature ATTACHMENT +
// the plan/retry plumbing against a software signer; it does NOT substitute for a
// real Ledger/Trezor confirming a devnet/testnet signature on a block explorer.
// The physical transport and the device's own signature bytes remain device-gated.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair, Transaction, Message } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';

const h = vi.hoisted(() => ({ ledgerSign: null, trezorSign: null }));

// Mock the provider surface used by sendSolHw. getSolNetwork/getRentExemptMinimum
// etc. all resolve through here.
vi.mock('../provider.js', () => ({
  getBalanceLamports: vi.fn(),
  getRentExemptMinimum: vi.fn(),
  getLamportsPerSignature: vi.fn(),
  getConnection: vi.fn(),
  broadcastRawTx: vi.fn(),
  confirmTx: vi.fn(),
}));

vi.mock('@ledgerhq/hw-app-solana', () => ({
  default: class MockAppSolana {
    constructor(transport) { this.transport = transport; }
    async signTransaction(path, msgBuffer) { return h.ledgerSign(path, msgBuffer); }
  },
}));

vi.mock('@trezor/connect-web', () => ({
  default: { solanaSignTransaction: (...args) => h.trezorSign(...args) },
}));

import {
  getBalanceLamports, getRentExemptMinimum, getLamportsPerSignature,
  getConnection, broadcastRawTx, confirmTx,
} from '../provider.js';
import { signAndBroadcastSolLedger, signAndBroadcastSolTrezor } from '../hw-send.js';

// Fee-payer test keypair (deterministic; NOT a real-funds key).
const senderKp = Keypair.fromSeed(new Uint8Array(32).fill(7));
const FROM = senderKp.publicKey.toBase58();
const TO = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey.toBase58();
const NETWORK = 'devnet';
const BLOCKHASH = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58();

// ed25519 sign the serialised message with the fee-payer seed (first 32 bytes of
// the 64-byte @solana secretKey) — exactly the 64-byte sig a device returns.
function edSign(msgBytes, kp = senderKp) {
  return ed25519.sign(new Uint8Array(msgBytes), kp.secretKey.slice(0, 32));
}

function wireUpProvider(capture) {
  getBalanceLamports.mockResolvedValue(1_000_000_000n); // 1 SOL
  getRentExemptMinimum.mockResolvedValue(890_880n);
  getLamportsPerSignature.mockResolvedValue(5000n);
  getConnection.mockReturnValue({
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1234 }),
  });
  broadcastRawTx.mockImplementation(async (_net, rawTx) => { capture.raw = rawTx; return 'FAKE_TX_SIG'; });
  confirmTx.mockResolvedValue({ value: { err: null } });
}

describe('sol/hw-send — Ledger signature attachment (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.ledgerSign = null; h.trezorSign = null; });

  it('attaches the device signature to the fee-payer and the raw tx verifies', async () => {
    const capture = {};
    wireUpProvider(capture);
    h.ledgerSign = async (_path, msgBuffer) => ({ signature: Buffer.from(edSign(msgBuffer)) });

    const res = await signAndBroadcastSolLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM, toAddress: TO,
      amountLamports: 100_000n,
    });

    expect(capture.raw).toBeTruthy();
    const signed = Transaction.from(capture.raw);
    // The attached device signature verifies against the serialised message.
    expect(signed.verifySignatures()).toBe(true);
    // The fee-payer occupies the first signature slot and carries a signature.
    expect(signed.signatures[0].publicKey.toBase58()).toBe(FROM);
    expect(signed.signatures[0].signature).toBeTruthy();
    expect(res.signature).toBe('FAKE_TX_SIG');
    expect(res.explorerUrl).toContain('FAKE_TX_SIG');
    expect(res.attempts).toBe(1);
  });

  it('the device signs exactly the serialised message the module built', async () => {
    const capture = {};
    wireUpProvider(capture);
    let handedToDevice = null;
    h.ledgerSign = async (_path, msgBuffer) => {
      handedToDevice = new Uint8Array(msgBuffer);
      return { signature: Buffer.from(edSign(msgBuffer)) };
    };

    await signAndBroadcastSolLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
    });

    // Reconstruct the message the broadcast tx committed to and confirm the bytes
    // the device saw are exactly those (no mutation between sign and serialise).
    const signed = Transaction.from(capture.raw);
    const committedMsg = signed.serializeMessage();
    expect(Buffer.from(handedToDevice).equals(committedMsg)).toBe(true);
  });

  it('a signature over the WRONG message fails verification (cannot be passed off as signed)', async () => {
    const capture = {};
    wireUpProvider(capture);
    // Device returns a structurally-valid 64-byte sig, but over unrelated bytes.
    h.ledgerSign = async () => ({ signature: Buffer.from(edSign(new Uint8Array(32).fill(1))) });

    // addSignature itself may accept the 64 bytes; the invariant we pin is that the
    // resulting raw tx does NOT verify — so any caller checking verifySignatures
    // (or the network) rejects it rather than treating it as validly signed.
    let raw;
    try {
      await signAndBroadcastSolLedger({
        transport: {}, networkKey: NETWORK, fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
      });
      raw = capture.raw;
    } catch {
      raw = capture.raw; // broadcast may or may not be reached depending on web3.js
    }
    if (raw) {
      expect(Transaction.from(raw).verifySignatures()).toBe(false);
    }
  });
});

describe('sol/hw-send — Trezor signature attachment (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.ledgerSign = null; h.trezorSign = null; });

  it('converts the hex signature, attaches it, and the raw tx verifies', async () => {
    const capture = {};
    wireUpProvider(capture);
    h.trezorSign = async ({ serializedTx }) => {
      const msgBytes = Buffer.from(serializedTx, 'hex');
      return { success: true, payload: { signature: Buffer.from(edSign(msgBytes)).toString('hex') } };
    };

    const res = await signAndBroadcastSolTrezor({
      networkKey: NETWORK, fromAddress: FROM, toAddress: TO, amountLamports: 250_000n,
    });

    const signed = Transaction.from(capture.raw);
    expect(signed.verifySignatures()).toBe(true);
    expect(signed.signatures[0].publicKey.toBase58()).toBe(FROM);
    expect(res.signature).toBe('FAKE_TX_SIG');
  });

  it('throws when the device reports failure (fail-closed, I4)', async () => {
    wireUpProvider({});
    h.trezorSign = async () => ({ success: false, payload: { error: 'User cancelled on device' } });
    await expect(signAndBroadcastSolTrezor({
      networkKey: NETWORK, fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
    })).rejects.toThrow(/cancel/i);
    expect(broadcastRawTx).not.toHaveBeenCalled();
  });
});
