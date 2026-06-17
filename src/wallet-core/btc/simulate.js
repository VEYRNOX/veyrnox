// wallet-core/btc/simulate.js
//
// Transaction "simulation" for Bitcoin (Phase S2 — transaction safety). Bitcoin
// has NO programmable on-chain execution to dry-run, so an honest preview is NOT
// a fake "simulation": it is the EXACT decoded transaction the user is about to
// sign — inputs, outputs, change, and fee — derived from the coin-selection plan
// (btc/send.js estimateBtcSend / coinselect.js), with a few KNOWN risk flags.
//
// LOCAL-FIRST: the plan comes from the EXISTING Esplora indexer (the one the
// wallet already uses for UTXOs/fees, self-hostable). Nothing is sent to a
// third-party scoring service. This module is PURE over a plan — no network, no
// keys — so it is fully unit-testable.
//
// Lives under the guarded wallet-core path so the RNG tripwire covers it too.

const LARGE_OUTFLOW_RATIO = 0.9;

function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (v == null) return 0n;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  return BigInt(v);
}

// Format sats (BigInt) to a BTC decimal string without floating-point drift.
function satsToBtc(sats) {
  const s = toBig(sats);
  const neg = s < 0n;
  const abs = neg ? -s : s;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/**
 * Decode a BTC coin-selection plan into a pre-sign preview.
 *
 * @param {object} [p]
 * @param {{ inputs?: Array<{value:bigint|number|string}>, outputs?: Array<{address:string, value:bigint|number|string}>, feeSats?:bigint|number|string }} [p.plan]
 * @param {string} [p.fromAddress]       the wallet address (change returns here)
 * @param {Array}  [p.knownAddresses]    reserved (BTC has no EVM-style poison list)
 * @param {number} [p.largeOutflowRatio] override the large-outflow warning threshold
 * @returns {object} preview result (same shape family as the EVM simulator).
 */
export function describeBtcPlan({ plan, fromAddress, largeOutflowRatio = LARGE_OUTFLOW_RATIO } = {}) {
  const inputs = plan?.inputs || [];
  const outputs = plan?.outputs || [];
  const fee = toBig(plan?.feeSats ?? 0);

  const totalIn = inputs.reduce((a, i) => a + toBig(i.value), 0n);
  // Change is any output paying back to our own address; everything else is sent.
  const changeOuts = outputs.filter((o) => o.address === fromAddress);
  const recipientOuts = outputs.filter((o) => o.address !== fromAddress);
  const change = changeOuts.reduce((a, o) => a + toBig(o.value), 0n);
  const sent = recipientOuts.reduce((a, o) => a + toBig(o.value), 0n);

  const balanceChanges = recipientOuts.map((o) => ({
    label: 'You send', direction: 'out', amount: satsToBtc(o.value), symbol: 'BTC', who: o.address,
  }));
  if (change > 0n) {
    balanceChanges.push({ label: 'Change back to you', direction: 'in', amount: satsToBtc(change), symbol: 'BTC', who: fromAddress });
  }

  const risks = [];
  if (totalIn > 0n && sent > 0n) {
    const frac = Number(sent) / Number(totalIn);
    if (change === 0n) {
      // No change output — every selected input (minus fee) leaves the wallet.
      // That's the BTC shape of "drains the balance"; fees always keep the ratio
      // just under 1, so the absence of change is the reliable signal.
      risks.push({ level: 'high', code: 'entire_balance', title: 'Sends all selected inputs (no change)', detail: `This pays out every selected input (~${Math.round(frac * 100)}%) with no change back to you. Confirm the amount is intended.` });
    } else if (frac >= largeOutflowRatio) {
      risks.push({ level: 'medium', code: 'large_outflow', title: 'Unusually large outflow', detail: `This pays out ~${Math.round(frac * 100)}% of the selected inputs. Double-check the amount and recipient.` });
    }
  }

  return {
    chain: 'btc',
    simulated: false, // decode-only: no programmable execution to dry-run on BTC
    willRevert: null,
    decoded: {
      kind: 'btc_transfer',
      inputCount: inputs.length,
      totalIn: satsToBtc(totalIn),
      outputCount: outputs.length,
    },
    balanceChanges,
    fee: { amount: satsToBtc(fee), symbol: 'BTC', sub: `${inputs.length} input${inputs.length === 1 ? '' : 's'}` },
    risks,
    source: {
      mode: 'local-decode',
      queries: ['esplora:utxo', 'esplora:fee-rate'], // the existing indexer, not a scorer
      thirdParty: false,
    },
    coverageNote:
      'Bitcoin has no on-chain programmable execution to simulate. This is the EXACT decoded transaction ' +
      '(inputs, outputs, change, fee) you are about to sign, computed locally — not a third-party score. ' +
      'It is not a guarantee of safety; verify the recipient and amount yourself.',
  };
}
