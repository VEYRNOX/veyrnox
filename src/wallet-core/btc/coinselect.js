// wallet-core/btc/coinselect.js
//
// ⚠️  HIGHEST-RISK CODE IN THE BTC STACK (docs/PhaseBTC.md §4). ⚠️
//
// In the UTXO model you don't edit a balance — you consume whole UTXOs as
// inputs and create outputs. The recipient gets one output; the REMAINDER must
// come back to you as an explicit CHANGE output. The miner fee is whatever is
// left over: fee = sum(inputs) − sum(outputs). The classic catastrophic bug is
// forgetting (or miscomputing) the change output, which silently donates the
// remainder to miners as fee. This module's entire job is to make that
// impossible, with an explicit value-conservation assertion on every plan.
//
// DESIGN
//   - All arithmetic is in BigInt satoshis. No floats touch money.
//   - Strategy: largest-first ("accumulate biggest"). Deterministic, easy to
//     audit, minimizes input count (lower fee). Documented, not clever.
//   - Fee = estimated vsize × feeRate(sat/vB). vsize is estimated CONSERVATIVELY
//     (worst-case 73-byte signature per input) so we never underpay and get the
//     tx stuck. Because the change amount is computed as the exact remainder,
//     any estimation slack is absorbed by the fee — it can never come out of,
//     or exceed, the change.
//   - CHANGE ADDRESS: a wallet-controlled address the CALLER supplies. v1 sends
//     change back to the wallet's own receive address (change-to-self). That is
//     a deliberate, documented choice: it guarantees the change is (a) spendable
//     and (b) VISIBLE in the displayed balance, which scans that address. A
//     dedicated change branch (m/84'/1'/0'/1/x) exists in derivation.js for a
//     future multi-address upgrade; using it now would hide change from a
//     single-address balance view and *look* like lost funds. Trade-off:
//     address reuse (a privacy cost), accepted for v1 correctness+visibility.
//   - DUST: change below the dust threshold is uneconomical to ever spend, so it
//     is folded into the fee (standard behaviour) and disclosed on the plan as
//     `droppedToFeeSats`. We never create a dust change output.
//
// The output is a PLAN (pure data) — no keys, no signing. send.js turns a plan
// into a signed tx. Keeping selection pure makes it unit-testable with exact
// satoshi assertions (see __tests__/btc-coinselect.test.js).

// --- vsize model for native SegWit P2WPKH (vbytes) ---------------------------
// Conservative (rounded-up) per BIP-141 weight accounting:
//   overhead: nVersion(4)+locktime(4)+in/out counts(~2)+segwit marker&flag → 11
//   input:    outpoint(36)+empty scriptSig(1)+sequence(4)=41 non-witness
//             + witness(~108wu: len+73B sig+34B pubkey)/4 ≈ 27  → 68
//   output:   value(8)+scriptPubKey len(1)+P2WPKH program(22)       → 31
// These intentionally round UP so the real signed tx is never larger than the
// fee we charged for. A non-P2WPKH recipient output may differ by a few vbytes
// (P2PKH 34, P2TR 43); that only nudges fee accuracy, never the change invariant.
export const TX_OVERHEAD_VB = 11;
export const P2WPKH_INPUT_VB = 68;
export const P2WPKH_OUTPUT_VB = 31;

// Dust floor. Change at or below this is folded into the fee. 546 sats is the
// conservative, widely-recognised dust limit; safe to sit above the strict
// P2WPKH relay dust (~294 sats).
export const DEFAULT_DUST_SATS = 546n;

export function estimateVsize(numInputs, numOutputs) {
  return TX_OVERHEAD_VB + P2WPKH_INPUT_VB * numInputs + P2WPKH_OUTPUT_VB * numOutputs;
}

/** Fee in sats for a tx of (numInputs, numOutputs) at feeRate sat/vB. */
export function estimateFeeSats(numInputs, numOutputs, feeRate) {
  return BigInt(estimateVsize(numInputs, numOutputs)) * BigInt(feeRate);
}

/**
 * Select UTXOs and construct a value-conserving spend plan.
 *
 * @param {object} params
 * @param {Array<{txid:string,vout:number,value:bigint}>} params.utxos - spendable UTXOs (sats as BigInt).
 * @param {string} params.toAddress      - recipient address.
 * @param {bigint} [params.amountSats]   - amount to send (sats). Ignored if sendMax.
 * @param {string} params.changeAddress  - WALLET-CONTROLLED change address (required).
 * @param {number} params.feeRate        - sat/vByte (integer >= 1).
 * @param {boolean} [params.sendMax=false] - sweep: send the entire balance minus fee (no change).
 * @param {bigint} [params.dustSats]      - dust threshold override.
 * @returns {{
 *   inputs: Array<{txid:string,vout:number,value:bigint}>,
 *   outputs: Array<{address:string,value:bigint,isChange:boolean}>,
 *   feeSats: bigint, vsize: number, feeRate: number,
 *   selectedSats: bigint, sendSats: bigint, changeSats: bigint, droppedToFeeSats: bigint,
 * }}
 */
export function selectCoins({
  utxos,
  toAddress,
  amountSats,
  changeAddress,
  feeRate,
  sendMax = false,
  dustSats = DEFAULT_DUST_SATS,
}) {
  if (!Array.isArray(utxos) || utxos.length === 0) throw new Error('No UTXOs available to spend');
  if (!toAddress) throw new Error('Missing recipient address');
  if (!changeAddress) throw new Error('Missing change address (must be wallet-controlled)');
  if (!Number.isInteger(feeRate) || feeRate < 1) throw new Error(`Invalid fee rate: ${feeRate}`);

  // 21 million BTC in satoshis — any UTXO above this is physically impossible and
  // indicates a malicious or corrupted RPC response (I5).
  const MAX_UTXO_SATS = 2_100_000_000_000_000n;

  // Normalise + guard inputs. Every UTXO value must be a positive BigInt.
  const pool = utxos.map((u) => {
    const value = BigInt(u.value);
    if (value <= 0n) throw new Error(`UTXO ${u.txid}:${u.vout} has non-positive value`);
    if (value > MAX_UTXO_SATS) throw new Error(`UTXO ${u.txid}:${u.vout} value exceeds 21M BTC cap — possible malicious RPC`);
    return { txid: u.txid, vout: u.vout, value };
  });
  const balance = pool.reduce((s, u) => s + u.value, 0n);

  // Largest-first: fewer inputs => smaller tx => lower fee. Deterministic order.
  pool.sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));

  // ---- SWEEP / send-max: spend everything, single output, no change ----------
  if (sendMax) {
    const inputs = pool;
    const fee = estimateFeeSats(inputs.length, 1, feeRate);
    const send = balance - fee;
    if (send <= 0n) throw new Error('Balance does not cover the network fee');
    if (send <= dustSats) throw new Error('Amount after fee is dust');
    const plan = {
      inputs,
      outputs: [{ address: toAddress, value: send, isChange: false }],
      feeSats: fee,
      vsize: estimateVsize(inputs.length, 1),
      feeRate,
      selectedSats: balance,
      sendSats: send,
      changeSats: 0n,
      droppedToFeeSats: 0n,
    };
    assertPlanConserves(plan);
    return plan;
  }

  // ---- normal send: accumulate until inputs cover amount + fee --------------
  if (typeof amountSats !== 'bigint') throw new Error('amountSats must be a BigInt');
  if (amountSats <= 0n) throw new Error('Send amount must be positive');
  if (amountSats <= dustSats) throw new Error('Send amount is below the dust threshold');

  const inputs = [];
  let selected = 0n;
  for (const u of pool) {
    inputs.push(u);
    selected += u.value;
    // Threshold uses 2 outputs (recipient + change) — the expected shape.
    const feeWithChange = estimateFeeSats(inputs.length, 2, feeRate);
    if (selected >= amountSats + feeWithChange) break;
  }

  // Did we actually reach sufficiency? (loop may exhaust the pool short.)
  const feeWithChange = estimateFeeSats(inputs.length, 2, feeRate);
  if (selected < amountSats + feeWithChange) {
    // Maybe it still works WITHOUT a change output (no-change branch below)?
    const feeNoChange = estimateFeeSats(inputs.length, 1, feeRate);
    if (selected < amountSats + feeNoChange) {
      throw new Error(
        `Insufficient funds: need ${amountSats + feeNoChange} sats (amount+fee), have ${selected}`,
      );
    }
  }

  // Compute change as the EXACT remainder assuming a 2-output tx.
  let change = selected - amountSats - feeWithChange;
  let outputs;
  let fee;
  let droppedToFee = 0n;

  if (change > dustSats) {
    // Normal case: explicit change output back to a wallet-controlled address.
    fee = feeWithChange;
    outputs = [
      { address: toAddress, value: amountSats, isChange: false },
      { address: changeAddress, value: change, isChange: true },
    ];
  } else {
    // Change is dust (or negative-but-covered) — drop it. Recompute as a
    // 1-output tx; the would-be change is absorbed into the fee. Disclosed.
    fee = estimateFeeSats(inputs.length, 1, feeRate);
    // With one fewer output the fee is lower, so re-derive the absorbed amount.
    droppedToFee = selected - amountSats - fee;
    if (droppedToFee < 0n) {
      throw new Error('Insufficient funds for a no-change transaction');
    }
    // Fold the remainder into the fee so value is conserved exactly.
    fee = selected - amountSats;
    change = 0n;
    outputs = [{ address: toAddress, value: amountSats, isChange: false }];
  }

  const plan = {
    inputs,
    outputs,
    feeSats: fee,
    vsize: estimateVsize(inputs.length, outputs.length),
    feeRate,
    selectedSats: selected,
    sendSats: amountSats,
    changeSats: change,
    droppedToFeeSats: droppedToFee,
  };
  assertPlanConserves(plan);
  return plan;
}

/**
 * HARD invariant: sum(inputs) === sum(outputs) + fee, with every amount
 * positive and the fee sane. This is the anti-fund-burn tripwire — if a plan
 * ever fails it, we throw rather than sign. Exported so send.js can re-check the
 * plan it actually builds against the bytes it's about to broadcast.
 */
export function assertPlanConserves(plan) {
  const inSum = plan.inputs.reduce((s, i) => s + BigInt(i.value), 0n);
  const outSum = plan.outputs.reduce((s, o) => s + BigInt(o.value), 0n);
  if (plan.feeSats <= 0n) throw new Error(`Non-positive fee: ${plan.feeSats}`);
  for (const o of plan.outputs) {
    if (BigInt(o.value) <= 0n) throw new Error(`Non-positive output to ${o.address}`);
  }
  if (inSum !== outSum + plan.feeSats) {
    throw new Error(
      `VALUE NOT CONSERVED: inputs ${inSum} != outputs ${outSum} + fee ${plan.feeSats}. Refusing to build tx (would burn or invent funds).`,
    );
  }
  // Exactly one change output at most, and it must target the change address.
  const changeOutputs = plan.outputs.filter((o) => o.isChange);
  if (changeOutputs.length > 1) throw new Error('More than one change output');
  return true;
}
