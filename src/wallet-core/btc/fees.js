// wallet-core/btc/fees.js
//
// Bitcoin fee tiers (sat/vByte) for the UTXO model. The rates come from the
// EXISTING Esplora provider (getFeeRate) — the SAME indexer the send path uses
// for UTXOs and broadcast. NO new data source.
//
// UTXO fees are NOT a single price: the miner fee = tx vsize × feeRate, and the
// vsize depends on how many UTXOs coin selection ends up spending. So a tier here
// is a sat/vB RATE; the real fee is computed by selectCoins() at send time and
// the chosen rate flows straight into it (send.js passes feeRate → selectCoins).
// We also surface a display ESTIMATE for a typical 1-input/2-output P2WPKH spend
// so the user sees a concrete number, clearly labelled as an estimate.

import { getFeeRate } from './provider.js';
import { estimateFeeSats } from './coinselect.js';

// Confirmation targets in blocks (~10 min/block) → indicative ETAs. Esplora's
// /fee-estimates is keyed by target block, so each tier is a real query.
export const BTC_TIERS = [
  { id: 'slow',     label: 'Slow',     targetBlocks: 6, etaLabel: '~60 min' },
  { id: 'standard', label: 'Standard', targetBlocks: 3, etaLabel: '~30 min' },
  { id: 'fast',     label: 'Fast',     targetBlocks: 1, etaLabel: '~10 min' },
];

// Typical spend shape used ONLY for the display fee estimate.
export const TYPICAL_INPUTS = 1;
export const TYPICAL_OUTPUTS = 2; // recipient + change

// Codex P2 2026-08-15: upper bound on any per-tier feeRate. Prior behaviour
// only enforced monotonic ordering, so a hostile / misconfigured Esplora
// endpoint could pin an absurd sat/vB (e.g. 100000) and the wallet would
// silently overpay miner fees on the next send. Ceiling picked to sit well
// above every real congestion regime observed on mainnet (~600 sat/vB was
// the November-2023 ordinals peak) while still catching a broken oracle.
// Applied at the raw-rate stage so `estFeeSats` also derives from the
// clamped rate.
export const MAX_FEE_RATE_SAT_VB = 2000;

/**
 * PURE: assemble tiers from three sat/vB rates (slow, standard, fast), each with
 * a display fee estimate for a typical spend. The estimate uses the same
 * estimateFeeSats() the real coin selection uses, so it's consistent with what
 * the send path will charge for that shape.
 * @param {number[]} tierRates  [slow, standard, fast] in sat/vB
 */
export function buildBtcTiers(tierRates) {
  const [slow, standard, fast] = tierRates;
  const rates = [slow, standard, fast];
  return BTC_TIERS.map((t, i) => {
    // Codex P2 2026-08-15: clamp each rate before it flows into estimateFeeSats
    // AND into the send path (send.js pulls `feeRate` from the selected tier).
    // A NaN / Infinity / negative rate collapses to 1 (the relay floor); an
    // absurd rate collapses to MAX_FEE_RATE_SAT_VB.
    const raw = Number(rates[i]);
    const feeRate = !Number.isFinite(raw) || raw < 1
      ? 1
      : Math.min(raw, MAX_FEE_RATE_SAT_VB);
    return {
      id: t.id,
      label: t.label,
      etaLabel: t.etaLabel,
      feeRate,
      estFeeSats: Number(estimateFeeSats(TYPICAL_INPUTS, TYPICAL_OUTPUTS, feeRate)),
    };
  });
}

/**
 * PURE: keep three rates monotonic (slow ≤ standard ≤ fast) for display. A quiet
 * testnet often reports identical or inverted rates across targets; we never show
 * "Slow" costing more than "Fast". Does not invent spread — equal stays equal.
 * @param {number[]} rates  [slow, standard, fast]
 */
export function clampMonotonic(rates) {
  const [slow, standard, fast] = rates;
  const lo = Math.min(slow, standard, fast);
  const hi = Math.max(slow, standard, fast);
  const mid = Math.min(Math.max(standard, lo), hi);
  return [lo, mid, hi];
}

/**
 * LIVE estimate from the EXISTING Esplora provider: one getFeeRate() per target
 * block. Each returned rate is already clamped to a ≥1 sat/vB relay floor by the
 * provider.
 * @returns {Promise<{ chain, symbol, decimals, tiers }>}
 */
export async function estimateBtcFeeTiers({ networkKey }) {
  const rates = await Promise.all(
    BTC_TIERS.map((t) => getFeeRate(networkKey, t.targetBlocks)),
  );
  return {
    chain: 'btc',
    symbol: 'BTC',
    decimals: 8,
    tiers: buildBtcTiers(clampMonotonic(rates)),
  };
}
