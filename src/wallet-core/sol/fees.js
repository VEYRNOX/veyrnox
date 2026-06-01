// wallet-core/sol/fees.js
//
// Solana fee tiers — handled NATIVELY, not forced into the EVM gas-limit×price
// shape. A Solana fee is:
//     base fee  = lamportsPerSignature × #signatures   (protocol constant, ~5000)
//   + priority  = ceil(microLamportsPerCU × computeUnitLimit / 1e6)   (OPTIONAL)
// The priority fee is set by attaching ComputeBudget instructions to the tx (see
// solComputeBudgetIxns in send.js). It does NOT exist on the EVM model and is the
// ONLY knob that speeds inclusion under congestion.
//
// All numbers come from the EXISTING provider (getLamportsPerSignature +
// getRecentPrioritizationFee, both on the same Connection) — NO new data source.

import { getLamportsPerSignature, getRecentPrioritizationFee } from './provider.js';

// A native SOL transfer needs one signature. When a priority fee is requested we
// also set an explicit compute-unit LIMIT (a bare transfer is ~150 CU; the two
// ComputeBudget instructions add a little). 1000 CU is a safe ceiling that keeps
// the priority fee small and predictable while never under-budgeting the tx.
export const SOL_NUM_SIGNATURES = 1;
export const SOL_DEFAULT_CU_LIMIT = 1000;

// microLamports/CU floor for a non-"none" tier when the testnet reads ~0, so
// "Standard"/"Fast" still attach a real (if tiny) priority price.
export const SOL_PRIORITY_FLOOR_MICRO = 1000;

export const SOL_TIERS = [
  { id: 'none',     label: 'None',     priorityMult: 0, etaLabel: 'standard' },
  { id: 'standard', label: 'Standard', priorityMult: 1, etaLabel: 'faster' },
  { id: 'fast',     label: 'Fast',     priorityMult: 2, etaLabel: 'fastest' },
];

/**
 * PURE: lamports added by a compute-unit PRICE (micro-lamports/CU) over a CU
 * LIMIT, rounded UP (ceil) so we never under-fund. BigInt throughout.
 */
export function solPriorityLamports(microLamportsPerCU, cuLimit = SOL_DEFAULT_CU_LIMIT) {
  const micro = BigInt(Math.max(0, Math.round(Number(microLamportsPerCU) || 0)));
  const limit = BigInt(cuLimit);
  return (micro * limit + 999_999n) / 1_000_000n; // ceil division
}

/**
 * PURE: build tiers from the per-signature base fee and a live median priority
 * price. totalLamports = baseFee + priorityLamports. The "none" tier attaches no
 * ComputeBudget instructions (priorityMicroLamports = 0, cuLimit = 0), preserving
 * the exact pre-existing base-fee-only behaviour.
 */
export function buildSolTiers({ baseLamportsPerSig, priorityMicroLamports, cuLimit = SOL_DEFAULT_CU_LIMIT }) {
  const baseLamports = BigInt(baseLamportsPerSig) * BigInt(SOL_NUM_SIGNATURES);
  const median = priorityMicroLamports == null ? 0 : Number(priorityMicroLamports);
  return SOL_TIERS.map((t) => {
    let priceMicro = Math.round(median * t.priorityMult);
    if (t.priorityMult > 0 && priceMicro <= 0) priceMicro = SOL_PRIORITY_FLOOR_MICRO * t.priorityMult;
    const useCuLimit = t.priorityMult === 0 ? 0 : cuLimit;
    const priorityLamports = t.priorityMult === 0 ? 0n : solPriorityLamports(priceMicro, useCuLimit);
    return {
      id: t.id,
      label: t.label,
      etaLabel: t.etaLabel,
      priorityMicroLamports: t.priorityMult === 0 ? 0 : priceMicro,
      computeUnitLimit: useCuLimit,
      priorityLamports: priorityLamports.toString(),
      baseLamports: baseLamports.toString(),
      totalLamports: (baseLamports + priorityLamports).toString(),
    };
  });
}

/**
 * LIVE estimate from the EXISTING provider (no new data source): per-signature
 * base fee + median recent prioritization fee.
 * @returns {Promise<{ chain, symbol, decimals, baseLamports, priorityMicroLamports, tiers }>}
 */
export async function estimateSolFeeTiers({ networkKey, cuLimit = SOL_DEFAULT_CU_LIMIT }) {
  const [baseLamports, priorityMicro] = await Promise.all([
    getLamportsPerSignature(networkKey),
    getRecentPrioritizationFee(networkKey),
  ]);
  return {
    chain: 'sol',
    symbol: 'SOL',
    decimals: 9,
    baseLamports: baseLamports.toString(),
    priorityMicroLamports: priorityMicro,
    tiers: buildSolTiers({ baseLamportsPerSig: baseLamports, priorityMicroLamports: priorityMicro, cuLimit }),
  };
}
