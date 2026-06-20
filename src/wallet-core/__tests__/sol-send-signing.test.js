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

// CONSOLE-1 (#179) regression lock — BYTE-FOR-BYTE serializer output.
//
// The buffer.Buffer browser-externalization warning originated inside
// @solana/web3.js (its bundled bn.js probes for a Node `Buffer`). The fix
// installs a real `Buffer` global (src/main.jsx) + resolves the bare `buffer`
// specifier to the genuine polyfill (vite.config.js). @solana/web3.js serializes
// transactions via Buffer, so this test PINS the exact serialized bytes for a
// fixed transfer: if any Buffer-handling change ever altered the wire bytes (a
// silent fund-safety regression), this hash mismatch fails loudly. The vector is
// independent of any global Buffer state — Transaction.serialize() must produce
// identical bytes whether Buffer is the polyfill or absent.
describe('buildAndSignSol — serialized bytes are pinned (CONSOLE-1 #179 regression lock)', () => {
  // Authoritative wire bytes for sender=seed(1), recipient=seed(2),
  // blockhash=base58(seed(3)), amount=123_456_789 lamports, base-fee-only.
  // Trailing `15cd5b0700000000` = 123456789 as u64 LE — the transfer amount.
  const PINNED_TX_HEX =
    '010aec448bf22a54b587133dfddcf709442fff83a6443acd49b21d3a3210a6b5b4b501a0059aa53b42c73196160c56f79df485d74c2ff613d10f2734c5aa2faa09010001038a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c8139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b3940000000000000000000000000000000000000000000000000000000000000000030303030303030303030303030303030303030303030303030303030303030301020200010c0200000015cd5b0700000000';

  it('serializes the fixed transfer to the exact pinned bytes', () => {
    const { rawTx } = buildAndSignSol({
      keypair: sender,
      toPubkey: recipient,
      amountLamports: 123_456_789n,
      blockhash: BLOCKHASH,
    });
    const hex = Array.from(Uint8Array.from(rawTx))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe(PINNED_TX_HEX);
  });
});

describe('sol/send.js — H-3: getSignatureLanding exception guard (structural)', () => {
  it('source contains try/catch around getSignatureLanding in the retry loop', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, '../sol/send.js'), 'utf8');
    // After the fix, a try block must appear immediately before getSignatureLanding.
    expect(/try\s*\{[^}]*getSignatureLanding/s.test(src)).toBe(true);
  });
});
