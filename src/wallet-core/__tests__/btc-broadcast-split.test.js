// src/wallet-core/__tests__/btc-broadcast-split.test.js
//
// The Trezor BTC path signs on the device, so send.js needs a broadcast-only
// helper that takes an already-signed raw tx (hex) and pushes it. The canonical
// txid is derived LOCALLY from the signed bytes (deterministic) — never trusted
// from the untrusted indexer's echoed body. This pins btcTxidFromHex (pure): the
// locally re-derived txid must equal @scure/btc-signer's own Transaction.id.

import { describe, it, expect } from 'vitest';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Transaction, p2wpkh } from '@scure/btc-signer';
import { btcTxidFromHex } from '../btc/send.js';

describe('btcTxidFromHex — canonical txid is derived from the signed bytes', () => {
  it('matches Transaction.id for a round-tripped signed tx', () => {
    const priv = new Uint8Array(32).fill(7);
    const pub = secp256k1.getPublicKey(priv, true);
    const owner = p2wpkh(pub);
    const tx = new Transaction();
    tx.addInput({
      txid: hex.decode('aa'.repeat(32)),
      index: 0,
      witnessUtxo: { script: owner.script, amount: 100_000n },
    });
    tx.addOutputAddress(owner.address, 90_000n);
    tx.sign(priv);
    tx.finalize();
    expect(btcTxidFromHex(tx.hex)).toBe(tx.id);
  });

  it('throws on garbage hex (fail closed)', () => {
    expect(() => btcTxidFromHex('not-hex')).toThrow();
  });
});
