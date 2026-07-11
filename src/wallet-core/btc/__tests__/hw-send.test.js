// wallet-core/btc/__tests__/hw-send.test.js
//
// Audit finding M-2 / issue #746: btc/hw-send.js had ZERO unit coverage. Unlike
// EVM/SOL, the BTC device performs the actual signing AND serialisation (Ledger's
// createPaymentTransaction returns a full signed hex; Trezor returns serializedTx),
// so there is no {v,r,s} or raw-signature reconstruction for us to re-derive from a
// software signer. What IS pure, security-relevant, and unit-testable BEFORE the
// device is reached:
//   1. The ownership guard: p2wpkh(devicePubKey) MUST equal fromAddress, else throw
//      — this is what stops a swapped/wrong xpub from signing to an attacker path.
//   2. The plan → Trezor input/output MAPPING: script_type selection (SPENDWITNESS
//      inputs; a change output back to a wallet path is PAYTOWITNESS with the change
//      BIP-84 derivation, a recipient is PAYTOADDRESS), the BIP-32 address_n arrays,
//      amounts, and coin/push flags. A mis-mapped change output (e.g. sent as
//      PAYTOADDRESS to the change address, or the wrong address_n) is a real
//      fund/privacy hazard.
//   3. The Ledger legacy-API call shape: associatedKeysets per input, segwit=true,
//      sigHashType=SIGHASH_ALL, transactionVersion=2, and a per-input raw-tx fetch
//      (so the device can validate segwit input amounts).
//
// SCOPE / HONESTY: BUILT-level evidence only. The device's actual signing +
// serialisation is MOCKED here — a real Ledger/Trezor confirming a testnet txid on
// a block explorer is what would flip this to "verified", and that is device-gated.
// The output-script assembly bytes handed to Ledger are asserted structurally, not
// byte-verified against a signed on-chain tx.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';

const h = vi.hoisted(() => ({ trezorSign: null, ledgerSplit: null, ledgerCreate: null }));

vi.mock('../provider.js', () => ({
  getUtxos: vi.fn(),
  getFeeRate: vi.fn(),
  broadcastTx: vi.fn(),
}));

vi.mock('@trezor/connect-web', () => ({
  default: { signTransaction: (...args) => h.trezorSign(...args) },
}));

vi.mock('@ledgerhq/hw-app-btc', () => ({
  default: class MockAppBtc {
    constructor(opts) { this.opts = opts; }
    splitTransaction(...args) { return h.ledgerSplit(...args); }
    createPaymentTransaction(...args) { return h.ledgerCreate(...args); }
  },
}));

import { getUtxos, getFeeRate, broadcastTx } from '../provider.js';
import { signAndBroadcastBtcLedger, signAndBroadcastBtcTrezor } from '../hw-send.js';

// Fixtures generated from deterministic secp256k1 keys 0x0b.. / 0x16.. via
// @scure/btc-signer p2wpkh(pubKey, TEST_NETWORK) — see the accompanying scratch
// derivation. FROM's public key hashes to FROM; TO is an independent P2WPKH addr.
const PUB_FROM = '02552c630b64b54bf50210c9e253d38bd4949c72e22873500f6285c2bede312a84';
const FROM = 'tb1qmvlsp4pf7fc48q7vt9p93mq36m09ye5hpdz6rn';
const TO = 'tb1qdap3mkhdep3lhp3fkl27u70kx0063mp0thrraj';
const NETWORK = 'testnet';
const TXID = 'a'.repeat(64); // a valid-looking 64-hex broadcast acknowledgement

// A minimal, real, parseable raw tx (one input, one P2WPKH output) so the module's
// `Transaction.fromRaw(serializedTx)` txid-fallback path succeeds.
const RAW_TX_HEX =
  '0200000001' + '00'.repeat(32) + '00000000' + '00' + 'ffffffff' +
  '01' + 'e803000000000000' + '16' + '0014' + '00'.repeat(20) + '00000000';

// A VALID (on-curve) compressed pubkey that is NOT FROM's key — so the guard
// rejects on the address mismatch, not on a malformed-point error.
const WRONG_PUB = hex.encode(secp256k1.getPublicKey(new Uint8Array(32).fill(22), true));

const H32 = 0x80000000;
const UTXO = { txid: 'b'.repeat(64), vout: 2, value: 100_000n, confirmed: true };

function wireProvider() {
  getUtxos.mockResolvedValue([UTXO]);
  getFeeRate.mockResolvedValue(1);
  broadcastTx.mockResolvedValue(TXID);
}

describe('btc/hw-send — ownership guard (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); wireProvider(); h.trezorSign = vi.fn(); });

  it('Trezor: throws if the device public key does not hash to fromAddress (fail-closed)', async () => {
    // A different (valid) public key → different address → must be rejected before
    // any signing, so a swapped device/xpub can never sign on this vault.
    await expect(signAndBroadcastBtcTrezor({
      networkKey: NETWORK, fromAddress: FROM, btcPublicKeyHex: WRONG_PUB,
      toAddress: TO, amountSats: 10_000,
    })).rejects.toThrow(/does not match from address/i);
    expect(h.trezorSign).not.toHaveBeenCalled();
  });
});

describe('btc/hw-send — Trezor plan→input/output mapping (M-2 / #746)', () => {
  beforeEach(() => { vi.clearAllMocks(); wireProvider(); });

  it('maps inputs to SPENDWITNESS and splits recipient (PAYTOADDRESS) vs change (PAYTOWITNESS)', async () => {
    let captured = null;
    h.trezorSign = async (args) => {
      captured = args;
      return { success: true, payload: { serializedTx: RAW_TX_HEX, txid: undefined } };
    };

    const res = await signAndBroadcastBtcTrezor({
      networkKey: NETWORK, fromAddress: FROM, btcPublicKeyHex: PUB_FROM,
      toAddress: TO, amountSats: 10_000, feeRate: 1,
    });

    // coin/push flags: testnet coin, never auto-push (we broadcast ourselves).
    expect(captured.coin).toBe('test');
    expect(captured.push).toBe(false);

    // Single input, native-segwit spend, correct external BIP-84 path + amount.
    expect(captured.inputs).toHaveLength(1);
    expect(captured.inputs[0]).toMatchObject({
      prev_hash: UTXO.txid,
      prev_index: UTXO.vout,
      amount: '100000',
      script_type: 'SPENDWITNESS',
      address_n: [H32 | 84, H32 | 1, H32 | 0, 0, 0],
    });

    // Two outputs: recipient (external address, PAYTOADDRESS) and change (back to
    // a wallet CHANGE path, PAYTOWITNESS — NOT a bare address).
    const recipient = captured.outputs.find(o => o.address === TO);
    const change = captured.outputs.find(o => o.script_type === 'PAYTOWITNESS');
    expect(recipient).toMatchObject({ address: TO, amount: '10000', script_type: 'PAYTOADDRESS' });
    expect(change).toBeTruthy();
    expect(change.address).toBeUndefined();         // change must NOT leak as a raw address
    expect(change.address_n).toEqual([H32 | 84, H32 | 1, H32 | 0, 1, 0]); // change branch (…/1/0)
    expect(change.amount).toBe('89859');            // 100000 − 10000 − 141 (fee)

    // value conservation across the mapped outputs + fee = the selected input.
    const outSum = captured.outputs.reduce((s, o) => s + BigInt(o.amount), 0n);
    expect(outSum).toBe(100_000n - 141n);

    expect(res.txid).toBe(TXID);
    expect(res.explorerUrl).toContain(TXID);
    expect(res.plan).toBeTruthy();
  });

  it('throws when the device reports failure (fail-closed, I4)', async () => {
    h.trezorSign = async () => ({ success: false, payload: { error: 'User cancelled on device' } });
    await expect(signAndBroadcastBtcTrezor({
      networkKey: NETWORK, fromAddress: FROM, btcPublicKeyHex: PUB_FROM,
      toAddress: TO, amountSats: 10_000, feeRate: 1,
    })).rejects.toThrow(/cancel/i);
    expect(broadcastTx).not.toHaveBeenCalled();
  });
});

describe('btc/hw-send — Ledger createPaymentTransaction call shape (M-2 / #746)', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    wireProvider();
    // getRawTxHex fetch — content is irrelevant because splitTransaction is mocked.
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true, status: 200, text: async () => `raw-for:${url}`,
    }));
    h.ledgerSplit = vi.fn((rawHex) => ({ __split: rawHex }));
    h.ledgerCreate = vi.fn(async () => RAW_TX_HEX);
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  it('fetches each input raw tx and calls createPaymentTransaction with segwit/SIGHASH_ALL/version-2 and BIP-84 keysets', async () => {
    const res = await signAndBroadcastBtcLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM, btcPublicKeyHex: PUB_FROM,
      toAddress: TO, amountSats: 10_000, feeRate: 1,
    });

    // One raw-tx fetch per input, hitting the testnet Esplora /tx/:id/hex endpoint.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain(`/tx/${UTXO.txid}/hex`);

    // splitTransaction called per input with isSegwit=true.
    expect(h.ledgerSplit).toHaveBeenCalledTimes(1);
    expect(h.ledgerSplit.mock.calls[0][1]).toBe(true);

    // createPaymentTransaction gets the consensus-critical flags + BIP-84 keyset.
    expect(h.ledgerCreate).toHaveBeenCalledTimes(1);
    const arg = h.ledgerCreate.mock.calls[0][0];
    expect(arg.segwit).toBe(true);
    expect(arg.sigHashType).toBe(0x01);          // SIGHASH_ALL
    expect(arg.transactionVersion).toBe(2);
    expect(arg.associatedKeysets).toEqual(["84'/1'/0'/0/0"]);
    expect(arg.inputs).toHaveLength(1);
    // The serialised output script covers BOTH outputs (recipient + change): two
    // P2WPKH programs (OP_0 OP_PUSHBYTES_20) → two '0014' markers in the hex.
    expect(typeof arg.outputScriptHex).toBe('string');
    expect((arg.outputScriptHex.match(/0014/g) || []).length).toBe(2);

    expect(res.txid).toBe(TXID);
    expect(res.explorerUrl).toContain(TXID);
  });

  it('Ledger: throws on the ownership guard before any fetch/sign (fail-closed)', async () => {
    await expect(signAndBroadcastBtcLedger({
      transport: {}, networkKey: NETWORK, fromAddress: FROM, btcPublicKeyHex: WRONG_PUB,
      toAddress: TO, amountSats: 10_000, feeRate: 1,
    })).rejects.toThrow(/does not match from address/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(h.ledgerCreate).not.toHaveBeenCalled();
  });
});
