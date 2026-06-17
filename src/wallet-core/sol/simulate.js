// wallet-core/sol/simulate.js
//
// Transaction "simulation" for Solana (Phase S2 — transaction safety). An honest
// preview decodes the System transfer instruction the user is about to sign and
// surfaces the OUTCOME (amount, base + priority fee, recipient) plus the result
// of the LOCAL rent-exemption / affordability pre-flight that send.js already
// runs (planSolTransfer). That pre-flight is a REAL local safety check — it
// throws on dust-to-new-account and sender-stranding before anything is signed —
// so if a plan exists, those traps were cleared.
//
// We deliberately do NOT build/sign a transaction here to call the RPC's
// simulateTransaction: that would touch the signing path. Decoding the planned
// transfer is the honest, key-free preview for Solana.
//
// LOCAL-FIRST: the plan comes from the EXISTING Solana RPC (the one already used
// for balances/blockhash/broadcast, self-hostable). Nothing is sent to a
// third-party scoring service. PURE over a plan — no network, no keys — so it is
// fully unit-testable. Lives under the guarded wallet-core path.

const LAMPORTS_PER_SOL = 1000000000n;

function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (v == null) return 0n;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  return BigInt(v);
}

// Format lamports (BigInt) to a SOL decimal string without floating-point drift.
function lamToSol(lamports) {
  const s = toBig(lamports);
  const neg = s < 0n;
  const abs = neg ? -s : s;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = (abs % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/**
 * Decode a Solana transfer plan into a pre-sign preview.
 *
 * @param {object} [p]
 * @param {{ amountLamports?:bigint|number|string, feeLamports?:bigint|number|string, baseFeeLamports?:bigint|number|string, priorityFeeLamports?:bigint|number|string, sendMax?:boolean }} [p.plan]
 * @param {string} [p.fromAddress]
 * @param {string} [p.toAddress]
 * @returns {object} preview result (same shape family as the EVM simulator).
 */
export function describeSolTransfer({ plan, fromAddress, toAddress } = {}) {
  const amount = toBig(plan?.amountLamports ?? 0);
  const fee = toBig(plan?.feeLamports ?? 0);
  const baseFee = toBig(plan?.baseFeeLamports ?? fee);
  const priority = toBig(plan?.priorityFeeLamports ?? 0);

  const balanceChanges = [
    { label: 'You send', direction: 'out', amount: lamToSol(amount), symbol: 'SOL' },
    { label: 'Recipient receives', direction: 'in', amount: lamToSol(amount), symbol: 'SOL', who: toAddress },
  ];

  const risks = [];
  // The rent/affordability traps were already enforced by planSolTransfer (it
  // throws). A surviving plan means they passed — but two outcomes are worth
  // pointing out so the user isn't surprised.
  if (plan?.sendMax) {
    risks.push({ level: 'info', code: 'empties_account', title: 'Empties the account', detail: 'Send-max leaves a zero balance; the account may be purged by the runtime once below the rent-exempt minimum.' });
  }
  if (priority > 0n) {
    risks.push({ level: 'info', code: 'priority_fee', title: 'Priority fee attached', detail: `A priority fee of ${lamToSol(priority)} SOL is included on top of the base fee.` });
  }

  return {
    chain: 'sol',
    simulated: false, // decode + local rent pre-flight; not a full program simulation
    willRevert: null,
    decoded: {
      kind: 'sol_transfer',
      instruction: 'System.transfer',
      from: fromAddress,
      to: toAddress,
    },
    balanceChanges,
    fee: {
      amount: lamToSol(fee),
      symbol: 'SOL',
      sub: priority > 0n ? `base ${lamToSol(baseFee)} + priority ${lamToSol(priority)}` : null,
    },
    risks,
    source: {
      mode: 'local-decode',
      queries: ['getBalance', 'getMinimumBalanceForRentExemption', 'getFeeForMessage'], // existing RPC, not a scorer
      thirdParty: false,
    },
    coverageNote:
      'Solana preview decodes the System transfer instruction and runs the local rent-exemption / ' +
      'affordability pre-flight — computed locally against your own RPC, not a third-party score. ' +
      'It is not a full program simulation and not a guarantee of safety; verify the recipient and amount.',
  };
}
