// src/wallet-core/__tests__/sol-broadcast-split.test.js
//
// The Trezor SOL path signs on the device: send.js must be able to BUILD an
// UNSIGNED System transfer (serialized base64) for the device to sign, then
// BROADCAST the device-signed bytes. This pins buildUnsignedSolTx (network-free
// when a blockhash is supplied): it must produce a base64 tx that commits to the
// right fee-payer, recipient and lamports, with NO signature yet.

import { describe, it, expect } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { base58 } from '@scure/base';
import { buildUnsignedSolTx } from '../sol/send.js';

const fromAddress = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey.toBase58();
const toAddress = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58();
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3));

describe('buildUnsignedSolTx — unsigned base64 transfer for device signing', () => {
  it('builds an unsigned System transfer to the right recipient/lamports', () => {
    const lamports = 123_456_789n;
    const { unsignedTxBase64 } = buildUnsignedSolTx({
      fromAddress,
      toAddress,
      lamports,
      blockhash: BLOCKHASH,
    });
    expect(typeof unsignedTxBase64).toBe('string');

    const raw = Buffer.from(unsignedTxBase64, 'base64');
    // requireAllSignatures:false — the tx is intentionally unsigned at this stage.
    const tx = Transaction.from(raw);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.feePayer.toBase58()).toBe(fromAddress);

    const transfer = tx.instructions.find((ix) =>
      ix.programId.equals(SystemProgram.programId),
    );
    expect(transfer).toBeTruthy();
    expect(transfer.keys[0].pubkey.toBase58()).toBe(fromAddress);
    expect(transfer.keys[1].pubkey.toBase58()).toBe(toAddress);
    const dv = new DataView(
      transfer.data.buffer,
      transfer.data.byteOffset,
      transfer.data.byteLength,
    );
    expect(dv.getUint32(0, true)).toBe(2); // SystemInstruction::Transfer
    expect(dv.getBigUint64(4, true)).toBe(lamports);

    // No real signature attached yet (device signs later).
    expect(tx.signatures.every((s) => s.signature == null)).toBe(true);
  });
});
