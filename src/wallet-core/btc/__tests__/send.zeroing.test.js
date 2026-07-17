// wallet-core/btc/__tests__/send.zeroing.test.js
//
// Audit finding M-2 (PR #962): the software BTC send path receives a live
// `privateKey` Uint8Array and hands it to tx.sign(privateKey) but never zeroed
// the bytes after use. Key material should be wiped as soon as it is no longer
// needed (mirrors keystore/web.js deriveKekC's finally-block zeroing). This test
// pins that after signAndBroadcastBtc resolves the caller-supplied privateKey
// buffer has been zeroed in-place.
//
// The zeroing itself is NOT mocked — the test observes the actual byte values of
// the buffer the caller still holds a reference to.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { p2wpkh } from '@scure/btc-signer';
import { TEST_NETWORK } from '@scure/btc-signer';

vi.mock('../provider.js', () => ({
  getUtxos: vi.fn(),
  getFeeRate: vi.fn(),
  broadcastTx: vi.fn(),
}));

import { getUtxos, getFeeRate, broadcastTx } from '../provider.js';
import { signAndBroadcastBtc } from '../send.js';

const NETWORK = 'testnet';

// Deterministic software key: 32-byte scalar -> compressed pubkey -> P2WPKH addr.
const PRIV_SEED = new Uint8Array(32).fill(11);
const PUB = secp256k1.getPublicKey(PRIV_SEED, true);
const FROM = p2wpkh(PUB, TEST_NETWORK).address;
const TO = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(22), true), TEST_NETWORK).address;

const UTXO = { txid: 'b'.repeat(64), vout: 0, value: 200_000n, confirmed: true };

describe('btc/send — privateKey zeroing (M-2, PR #962)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUtxos.mockResolvedValue([UTXO]);
    getFeeRate.mockResolvedValue(1);
    broadcastTx.mockResolvedValue('ok');
  });

  it('zeros the caller-supplied privateKey buffer after a successful send', async () => {
    const privateKey = Uint8Array.from(PRIV_SEED); // fresh copy the caller "owns"
    expect(privateKey.some((b) => b !== 0)).toBe(true); // sanity: not already zero

    await signAndBroadcastBtc({
      networkKey: NETWORK,
      privateKey,
      publicKey: PUB,
      fromAddress: FROM,
      toAddress: TO,
      amountSats: 10_000,
      feeRate: 1,
    });

    expect(Array.from(privateKey)).toEqual(Array.from(new Uint8Array(32)));
  });
});
