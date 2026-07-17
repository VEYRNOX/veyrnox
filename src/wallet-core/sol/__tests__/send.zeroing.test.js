// wallet-core/sol/__tests__/send.zeroing.test.js
//
// Audit finding M-2 (PR #962): the software SOL send path receives a live 32-byte
// ed25519 seed `privateKey` Uint8Array, reconstructs a Keypair via
// Keypair.fromSeed(privateKey), but never zeroed the seed bytes afterward. Key
// material should be wiped as soon as it is no longer needed (mirrors
// keystore/web.js deriveKekC's finally-block zeroing). This test pins that after
// signAndBroadcastSol resolves the caller-supplied privateKey buffer has been
// zeroed in-place.
//
// The zeroing itself is NOT mocked — the test observes the actual byte values of
// the buffer the caller still holds a reference to.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';

vi.mock('../provider.js', () => ({
  getBalanceLamports: vi.fn(),
  getLatestBlockhash: vi.fn(),
  getRentExemptMinimum: vi.fn(),
  getLamportsPerSignature: vi.fn(),
  broadcastRawTx: vi.fn(),
  confirmTx: vi.fn(),
  getSignatureLanding: vi.fn(),
}));

import {
  getBalanceLamports, getLatestBlockhash, getRentExemptMinimum,
  getLamportsPerSignature, broadcastRawTx, confirmTx,
} from '../provider.js';
import { signAndBroadcastSol } from '../send.js';

const NETWORK = 'devnet';
const PRIV_SEED = new Uint8Array(32).fill(7);
const senderKp = Keypair.fromSeed(PRIV_SEED);
const FROM = senderKp.publicKey.toBase58();
const TO = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey.toBase58();
const BLOCKHASH = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58();

describe('sol/send — privateKey zeroing (M-2, PR #962)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBalanceLamports.mockResolvedValue(1_000_000_000n);
    getRentExemptMinimum.mockResolvedValue(890_880n);
    getLamportsPerSignature.mockResolvedValue(5000n);
    getLatestBlockhash.mockResolvedValue({ blockhash: BLOCKHASH, lastValidBlockHeight: 1234 });
    broadcastRawTx.mockResolvedValue('FAKE_TX_SIG');
    confirmTx.mockResolvedValue({ value: { err: null } });
  });

  it('zeros the caller-supplied privateKey seed after a successful send', async () => {
    const privateKey = Uint8Array.from(PRIV_SEED); // fresh copy the caller "owns"
    expect(privateKey.some((b) => b !== 0)).toBe(true); // sanity: not already zero

    await signAndBroadcastSol({
      networkKey: NETWORK,
      privateKey,
      fromAddress: FROM,
      toAddress: TO,
      amountLamports: 100_000n,
    });

    expect(Array.from(privateKey)).toEqual(Array.from(new Uint8Array(32)));
  });
});
