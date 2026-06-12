// src/wallet-core/__tests__/sol-send-signing.test.js
//
// SOL local-signing verification (network-free). sol-send.test.js pins the rent
// PLANNER; this pins that buildAndSignSol actually signs a System transfer that
// commits to the right recipient and lamports, paid by the sender. The Solana
// analogue of evm-send-signing.test.js's "the signed bytes commit to the right
// recipient/value" property. A fixed blockhash is supplied so no RPC is needed.
import { describe, it, expect } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { base58 } from '@scure/base';
import { buildAndSignSol } from '../sol/send.js';

// Deterministic fixtures — fixed 32-byte ed25519 seeds (no randomness, no network).
const sender = Keypair.fromSeed(new Uint8Array(32).fill(1));
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
// A recent blockhash is any base58-encoded 32-byte value for offline construction.
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3));

describe('buildAndSignSol — local ed25519 signing commits to the right transfer', () => {
  it('signs a System transfer to the correct recipient and lamports, paid by the sender', () => {
    const amountLamports = 123_456_789n;
    const { rawTx, signature } = buildAndSignSol({
      keypair: sender,
      toPubkey: recipient,
      amountLamports,
      blockhash: BLOCKHASH,
    });

    expect(signature).toBeTruthy(); // first signature == canonical tx id
    const tx = Transaction.from(rawTx);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.feePayer.equals(sender.publicKey)).toBe(true);

    // Exactly one instruction — a base-fee-only System transfer (no priority ixns).
    expect(tx.instructions).toHaveLength(1);
    const ix = tx.instructions[0];
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    // System transfer layout: keys[0] = from (signer), keys[1] = to.
    expect(ix.keys[0].pubkey.equals(sender.publicKey)).toBe(true);
    expect(ix.keys[1].pubkey.equals(recipient)).toBe(true);

    // The transfer amount matches what we asked to send. Decode the System
    // transfer instruction data directly — @solana/web3.js v1.x dropped
    // SystemProgram.decodeTransfer. Layout: u32 LE instruction index (2 =
    // Transfer) followed by u64 LE lamports.
    const data = ix.data;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getUint32(0, true)).toBe(2);             // SystemInstruction::Transfer
    expect(dv.getBigUint64(4, true)).toBe(amountLamports);

    // The signature actually verifies against the sender's key (real ed25519).
    expect(tx.verifySignatures()).toBe(true);
  });

  it('attaches priority ComputeBudget instructions when a priority fee is set', () => {
    const { rawTx } = buildAndSignSol({
      keypair: sender,
      toPubkey: recipient,
      amountLamports: 1_000_000n,
      blockhash: BLOCKHASH,
      priorityMicroLamports: 1000,
      computeUnitLimit: 200000,
    });
    const tx = Transaction.from(rawTx);
    // 2 ComputeBudget ixns (unit limit + price) + 1 System transfer.
    expect(tx.instructions).toHaveLength(3);
  });
});
