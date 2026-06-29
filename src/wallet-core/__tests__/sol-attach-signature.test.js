// src/wallet-core/__tests__/sol-attach-signature.test.js
//
// The Trezor SOL path returns ONLY a signature (the device signs the serialized
// message). attachSolSignature reassembles a broadcastable signed tx from the
// unsigned base64 + the device's signature, WITHOUT ever holding a private key.
// This pins that the reattached signature verifies as the fee-payer's — proving
// the device signature is the one a software signer would have produced.

import { describe, it, expect } from 'vitest';
import { Keypair, Transaction } from '@solana/web3.js';
import { base58 } from '@scure/base';
import { buildUnsignedSolTx, attachSolSignature } from '../sol/send.js';

const senderKp = Keypair.fromSeed(new Uint8Array(32).fill(1));
const fromAddress = senderKp.publicKey.toBase58();
const toAddress = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58();
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3));

describe('attachSolSignature — reassemble a signed tx from a device signature', () => {
  it('produces a base64 tx whose signatures verify against the fee-payer', () => {
    const { unsignedTxBase64 } = buildUnsignedSolTx({
      fromAddress,
      toAddress,
      lamports: 1_000_000n,
      blockhash: BLOCKHASH,
    });

    // Simulate the device: sign with the (test-only) seed key and hand back a hex
    // signature — exactly the shape trezorSignSolTx returns.
    const unsigned = Transaction.from(Buffer.from(unsignedTxBase64, 'base64'));
    unsigned.sign(senderKp);
    const signatureHex = Buffer.from(unsigned.signature).toString('hex');

    const signedB64 = attachSolSignature(unsignedTxBase64, fromAddress, signatureHex);
    const signed = Transaction.from(Buffer.from(signedB64, 'base64'));
    expect(signed.verifySignatures()).toBe(true);
    expect(signed.signature).toBeTruthy();
  });
});
