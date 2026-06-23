// wallet-core/coldkey/__tests__/coldkey.test.js
//
// Cold-key signing (Feature 5). The wallet builds an UNSIGNED transaction and
// shows it as a QR to an air-gapped / external signer; the signer returns signed
// bytes which the wallet broadcasts. The PRIVATE KEY NEVER LEAVES THE EXTERNAL
// DEVICE — the unsigned payload carries NO secret (I1). These tests pin the
// round-trip integrity of the unsigned artifacts and the QR envelope.

import { describe, it, expect } from 'vitest';
import { hex } from '@scure/base';
import { TEST_NETWORK, getAddress, p2wpkh, Transaction } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';

import { buildUnsignedPsbt } from '../psbt.js';
import { buildUnsignedEvmTx } from '../evmUnsigned.js';
import { encodeColdPayload, decodeColdPayload, COLD_KIND } from '../qr.js';

// A deterministic testnet keypair (TESTNET-ONLY fixture — never real value).
const PRIV = hex.decode('1111111111111111111111111111111111111111111111111111111111111111');
const PUB = secp256k1.getPublicKey(PRIV, true); // 33-byte compressed
const FROM = p2wpkh(PUB, TEST_NETWORK).address;

describe('buildUnsignedPsbt — BTC unsigned PSBT round-trip', () => {
  const plan = {
    inputs: [
      { txid: 'a'.repeat(64), vout: 0, value: 100000n },
    ],
    outputs: [
      { address: getAddress('wpkh', PRIV, TEST_NETWORK), value: 60000n },
      { address: FROM, value: 39000n }, // change-to-self
    ],
    feeSats: 1000n,
  };

  it('produces a base64 PSBT that has NO finalized witnesses (unsigned)', () => {
    const { psbtBase64 } = buildUnsignedPsbt({ plan, publicKey: PUB, params: TEST_NETWORK });
    expect(typeof psbtBase64).toBe('string');
    expect(psbtBase64.length).toBeGreaterThan(0);
    // A signer must still be needed: the round-tripped tx must not be finalized.
    const tx = Transaction.fromPSBT(
      Uint8Array.from(atob(psbtBase64), (c) => c.charCodeAt(0)),
    );
    expect(tx.isFinal).toBe(false);
    expect(tx.inputsLength).toBe(1);
    expect(tx.outputsLength).toBe(2);
  });

  it('the unsigned PSBT carries NO private key material', () => {
    const { psbtBase64 } = buildUnsignedPsbt({ plan, publicKey: PUB, params: TEST_NETWORK });
    const raw = atob(psbtBase64);
    // The 32-byte private key (as hex or raw) must never appear in the artifact.
    expect(raw.includes(String.fromCharCode(...PRIV))).toBe(false);
  });

  it('round-trips: an external signer can sign+finalize the produced PSBT', () => {
    const { psbtBase64 } = buildUnsignedPsbt({ plan, publicKey: PUB, params: TEST_NETWORK });
    const tx = Transaction.fromPSBT(
      Uint8Array.from(atob(psbtBase64), (c) => c.charCodeAt(0)),
    );
    tx.sign(PRIV);
    tx.finalize();
    expect(tx.isFinal).toBe(true);
    expect(tx.id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildUnsignedEvmTx — EVM unsigned tx serialisation', () => {
  it('serialises an unsigned EIP-1559 tx with NO signature fields', () => {
    const unsigned = buildUnsignedEvmTx({
      chainId: 11155111,
      nonce: 3,
      to: '0x'.padEnd(42, '1'),
      valueWei: 1000000000000000n,
      maxFeePerGasWei: 30000000000n,
      maxPriorityFeePerGasWei: 1500000000n,
      gasLimit: 21000n,
    });
    expect(unsigned.unsignedSerialized).toMatch(/^0x02/); // typed EIP-1559 envelope
    expect(unsigned.chainId).toBe(11155111);
    // No signature in an unsigned tx.
    expect(unsigned.signature ?? null).toBeNull();
  });

  it('throws on a missing chainId (fail closed — wrong-network/replay risk)', () => {
    expect(() => buildUnsignedEvmTx({
      to: '0x'.padEnd(42, '1'), valueWei: 1n, nonce: 0,
      maxFeePerGasWei: 1n, maxPriorityFeePerGasWei: 1n, gasLimit: 21000n,
    })).toThrow();
  });
});

describe('cold QR envelope — encode/decode round-trip', () => {
  it('round-trips an unsigned EVM payload through the QR envelope', () => {
    const payload = {
      kind: COLD_KIND.EVM_UNSIGNED,
      networkKey: 'sepolia',
      unsignedSerialized: '0x02abcdef',
    };
    const encoded = encodeColdPayload(payload);
    expect(typeof encoded).toBe('string');
    const decoded = decodeColdPayload(encoded);
    expect(decoded).toEqual(payload);
  });

  it('decodeColdPayload returns null for a non-Veyrnox QR (never throws)', () => {
    expect(decodeColdPayload('not json at all')).toBeNull();
    expect(decodeColdPayload(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('rejects an unknown kind (fail closed)', () => {
    const encoded = JSON.stringify({ fmt: 'veyrnox-cold', v: 1, kind: 'EVIL', data: {} });
    expect(decodeColdPayload(encoded)).toBeNull();
  });
});
