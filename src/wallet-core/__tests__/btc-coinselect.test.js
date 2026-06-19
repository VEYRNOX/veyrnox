// wallet-core/__tests__/btc-coinselect.test.js
//
// THE change-output safety net (docs/PhaseBTC.md §4 — "the highest-risk bug in
// UTXO wallets; test it explicitly"). Every assertion here is in exact
// satoshis. The cardinal rule under test: sum(inputs) === sum(outputs) + fee,
// ALWAYS, and a correct change output is returned to a wallet-controlled
// address — never silently burned to fee.
//
// The fee model is deterministic (vsize × feeRate), so expected change/fee
// values are computed by hand in the comments and pinned.

import { describe, it, expect } from 'vitest';
import {
  selectCoins,
  estimateVsize,
  estimateFeeSats,
  assertPlanConserves,
  DEFAULT_DUST_SATS,
} from '../btc/coinselect.js';
import { deriveBtcAccount } from '../btc/derivation.js';
import { buildAndSignTx } from '../btc/send.js';
import { getBtcNetworkInfo } from '../btc/networks.js';

const TO = 'tb1qrecipient00000000000000000000000000000';   // opaque label; not validated by selectCoins
const CHANGE = 'tb1qchange0000000000000000000000000000000'; // wallet-controlled change addr
const utxo = (value, txid = 'a'.repeat(64), vout = 0) => ({ txid, vout, value: BigInt(value) });

// Helper: sum of a plan's inputs / outputs as BigInt.
const sum = (arr, k) => arr.reduce((s, x) => s + BigInt(x[k]), 0n);

describe('coinselect — value conservation (anti fund-burn)', () => {
  it('single input, normal change: inputs === outputs + fee, change is explicit and correct', () => {
    // 1 in, 2 out: vsize = 11 + 68 + 31*2 = 141; fee @10 = 1410.
    // change = 100000 - 50000 - 1410 = 48590 (> dust) -> explicit change output.
    const plan = selectCoins({ utxos: [utxo(100000)], toAddress: TO, amountSats: 50000n, changeAddress: CHANGE, feeRate: 10 });
    expect(plan.vsize).toBe(141);
    expect(plan.feeSats).toBe(1410n);
    expect(plan.changeSats).toBe(48590n);
    expect(plan.outputs).toHaveLength(2);
    const change = plan.outputs.find(o => o.isChange);
    expect(change).toBeTruthy();
    expect(change.address).toBe(CHANGE);   // change returns to a WALLET address
    expect(change.value).toBe(48590n);
    // The invariant, asserted directly:
    expect(sum(plan.inputs, 'value')).toBe(sum(plan.outputs, 'value') + plan.feeSats);
  });

  it('folds dust change into the fee (no uneconomical change output), disclosed', () => {
    // 51920 in, send 50000 @10. 2-out fee 1410 -> change 510 (<= dust 546) -> fold.
    // no-change: vsize 110, fee(1out) 1100; droppedToFee = 51920-50000-1100 = 820.
    // final fee = 51920 - 50000 = 1920; single output.
    const plan = selectCoins({ utxos: [utxo(51920)], toAddress: TO, amountSats: 50000n, changeAddress: CHANGE, feeRate: 10 });
    expect(plan.outputs).toHaveLength(1);
    expect(plan.changeSats).toBe(0n);
    expect(plan.feeSats).toBe(1920n);
    expect(plan.droppedToFeeSats).toBe(820n);
    expect(sum(plan.inputs, 'value')).toBe(sum(plan.outputs, 'value') + plan.feeSats);
  });

  it('selects largest-first and stops once covered (does not over-select)', () => {
    // [30000,20000,60000] send 70000 @5. sorted 60k,30k,20k.
    //  +60k: fee(1in,2out)=141*5=705; 70705>60000 continue.
    //  +30k=90000: fee(2in,2out)=209*5=1045; need 71045<=90000 -> stop (20k unused).
    //  change = 90000-70000-1045 = 18955.
    const plan = selectCoins({
      utxos: [utxo(30000, 'a'.repeat(64)), utxo(20000, 'b'.repeat(64)), utxo(60000, 'c'.repeat(64))],
      toAddress: TO, amountSats: 70000n, changeAddress: CHANGE, feeRate: 5,
    });
    expect(plan.inputs).toHaveLength(2);
    expect(plan.inputs[0].value).toBe(60000n); // biggest first
    expect(plan.changeSats).toBe(18955n);
    expect(plan.feeSats).toBe(1045n);
    expect(sum(plan.inputs, 'value')).toBe(sum(plan.outputs, 'value') + plan.feeSats);
  });

  it('sweep / sendMax spends everything with no change output', () => {
    // [100000,50000] sendMax @4. 2 in,1 out: vsize=11+136+31=178; fee=712.
    // send = 150000 - 712 = 149288.
    const plan = selectCoins({ utxos: [utxo(100000, 'a'.repeat(64)), utxo(50000, 'b'.repeat(64))], toAddress: TO, changeAddress: CHANGE, feeRate: 4, sendMax: true });
    expect(plan.outputs).toHaveLength(1);
    expect(plan.outputs[0].isChange).toBe(false);
    expect(plan.outputs[0].value).toBe(149288n);
    expect(plan.changeSats).toBe(0n);
    expect(plan.feeSats).toBe(712n);
    expect(sum(plan.inputs, 'value')).toBe(sum(plan.outputs, 'value') + plan.feeSats);
  });
});

describe('coinselect — guards', () => {
  it('throws on insufficient funds (amount + fee exceeds inputs)', () => {
    expect(() => selectCoins({ utxos: [utxo(1000)], toAddress: TO, amountSats: 50000n, changeAddress: CHANGE, feeRate: 5 }))
      .toThrow(/insufficient/i);
  });

  it('rejects an empty UTXO set', () => {
    expect(() => selectCoins({ utxos: [], toAddress: TO, amountSats: 1000n, changeAddress: CHANGE, feeRate: 5 }))
      .toThrow(/no utxos/i);
  });

  it('requires a wallet-controlled change address', () => {
    expect(() => selectCoins({ utxos: [utxo(100000)], toAddress: TO, amountSats: 1000n, changeAddress: '', feeRate: 5 }))
      .toThrow(/change address/i);
  });

  it('rejects a dust send amount', () => {
    expect(() => selectCoins({ utxos: [utxo(100000)], toAddress: TO, amountSats: DEFAULT_DUST_SATS, changeAddress: CHANGE, feeRate: 5 }))
      .toThrow(/dust/i);
  });

  it('rejects a non-BigInt amount', () => {
    expect(() => selectCoins({ utxos: [utxo(100000)], toAddress: TO, amountSats: 5000, changeAddress: CHANGE, feeRate: 5 }))
      .toThrow(/BigInt/i);
  });

  it('assertPlanConserves catches a tampered (burned) plan', () => {
    const plan = selectCoins({ utxos: [utxo(100000)], toAddress: TO, amountSats: 50000n, changeAddress: CHANGE, feeRate: 10 });
    // Simulate a dropped change output (the classic burn bug):
    const burned = { ...plan, outputs: plan.outputs.filter(o => !o.isChange) };
    expect(() => assertPlanConserves(burned)).toThrow(/VALUE NOT CONSERVED/);
  });
});

describe('coinselect — fee math helpers', () => {
  it('vsize follows the documented P2WPKH model', () => {
    expect(estimateVsize(1, 2)).toBe(141); // 11 + 68 + 62
    expect(estimateVsize(2, 1)).toBe(178); // 11 + 136 + 31
    expect(estimateFeeSats(1, 2, 10)).toBe(1410n);
  });
});

// Full pipeline (no network): selection -> build -> sign -> finalize. Proves the
// planned fee/change survives all the way into the SIGNED bytes — the library's
// own fee (sum inputs - sum outputs) must equal our planned fee, or buildAndSignTx
// refuses. This is the change-output gate exercised end-to-end minus broadcast.
describe('coinselect + signing pipeline (offline)', () => {
  const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('builds & signs a real testnet tx whose on-the-wire fee equals the planned fee, with change to self', () => {
    const acct = deriveBtcAccount(M, { networkKey: 'testnet', change: 0, index: 0 });
    const params = getBtcNetworkInfo('testnet').params;
    // A synthetic 0.002 BTC UTXO controlled by acct.address.
    const plan = selectCoins({
      utxos: [utxo(200000, 'd'.repeat(64), 0)],
      toAddress: acct.address,            // self-send is fine for the math; any valid tb1 works
      amountSats: 120000n,
      changeAddress: acct.address,        // change-to-self (v1 policy)
      feeRate: 5,
    });
    // 1 in, 2 out: vsize 141, fee 705; change = 200000-120000-705 = 79295.
    expect(plan.feeSats).toBe(705n);
    expect(plan.changeSats).toBe(79295n);

    const built = buildAndSignTx({ plan, privateKey: acct.privateKey, publicKey: acct.publicKey, params });
    expect(built.fee).toBe(plan.feeSats);       // signed-bytes fee == planned fee
    expect(typeof built.hex).toBe('string');
    expect(built.hex.length).toBeGreaterThan(0);
    expect(built.txid).toMatch(/^[0-9a-f]{64}$/); // a real 32-byte txid
  });

  it('buildAndSignTx rejects a value-inconsistent plan before signing', () => {
    const acct = deriveBtcAccount(M, { networkKey: 'testnet' });
    const params = getBtcNetworkInfo('testnet').params;
    const plan = selectCoins({ utxos: [utxo(200000, 'e'.repeat(64))], toAddress: acct.address, amountSats: 120000n, changeAddress: acct.address, feeRate: 5 });
    const tampered = { ...plan, outputs: plan.outputs.map(o => o.isChange ? { ...o, value: o.value + 10000n } : o) };
    expect(() => buildAndSignTx({ plan: tampered, privateKey: acct.privateKey, publicKey: acct.publicKey, params }))
      .toThrow(/VALUE NOT CONSERVED|mismatch/);
  });
});

// Import vitest utilities and estimateBtcSend for the next test block
import { vi, afterEach } from 'vitest';
import { estimateBtcSend } from '../btc/send.js';

vi.mock('../btc/provider.js', () => ({
  getUtxos: vi.fn(),
  getFeeRate: vi.fn().mockResolvedValue(5),
  broadcastTx: vi.fn(),
}));

import { getUtxos } from '../btc/provider.js';

describe('estimateBtcSend — confirmed UTXO filter (C-3)', () => {
  const ADDR = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'; // valid testnet bech32

  afterEach(() => { vi.clearAllMocks(); });

  it('throws when all UTXOs are unconfirmed', async () => {
    getUtxos.mockResolvedValue([
      { txid: 'aaaa', vout: 0, value: 100_000n, confirmed: false },
      { txid: 'bbbb', vout: 0, value: 200_000n, confirmed: false },
    ]);
    await expect(
      estimateBtcSend({
        networkKey: 'testnet',
        fromAddress: ADDR,
        toAddress: ADDR,
        amountSats: 50_000n,
      }),
    ).rejects.toThrow('No confirmed UTXOs available');
  });

  it('uses only confirmed UTXOs when mixed pool is returned', async () => {
    getUtxos.mockResolvedValue([
      { txid: 'cccc', vout: 0, value: 500_000n, confirmed: true },
      { txid: 'dddd', vout: 0, value: 200_000n, confirmed: false },
    ]);
    const { plan } = await estimateBtcSend({
      networkKey: 'testnet',
      fromAddress: ADDR,
      toAddress: ADDR,
      amountSats: 100_000n,
    });
    expect(plan.inputs.every(i => i.confirmed !== false)).toBe(true);
    expect(plan.inputs.some(i => i.txid === 'dddd')).toBe(false);
  });
});
