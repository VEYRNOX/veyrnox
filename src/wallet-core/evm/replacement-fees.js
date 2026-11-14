// Pure EIP-1559 replacement-fee math.
//
// Most EVM nodes require a replacement transaction to raise BOTH the fee cap
// and the priority fee by roughly 10%. All values here are integer wei. The
// multiplication is rounded UP so small values cannot round back to the old
// fee, and the explicit +1 floor also handles an original zero priority fee.

const BUMP_NUMERATOR = 110n;
const BUMP_DENOMINATOR = 100n;

function asNonNegativeWei(value, field) {
  const wei = BigInt(value);
  if (wei < 0n) throw new Error(`${field} cannot be negative`);
  return wei;
}

/** Raise an integer wei value by at least 10%, rounding up. */
export function bumpReplacementWei(value) {
  const current = asNonNegativeWei(value, 'Replacement fee');
  const roundedUp = (current * BUMP_NUMERATOR + BUMP_DENOMINATOR - 1n) / BUMP_DENOMINATOR;
  return roundedUp > current ? roundedUp : current + 1n;
}

/**
 * Raise both EIP-1559 fee fields. Returned values stay as BigInt so no money
 * amount crosses a floating-point representation.
 */
export function bumpEip1559Fees({ maxFeePerGas, maxPriorityFeePerGas }) {
  const nextMaxFee = bumpReplacementWei(maxFeePerGas);
  const nextPriority = bumpReplacementWei(maxPriorityFeePerGas);
  return {
    // EIP-1559 requires the fee cap to cover the priority fee.
    maxFeePerGas: nextMaxFee >= nextPriority ? nextMaxFee : nextPriority,
    maxPriorityFeePerGas: nextPriority,
  };
}

function feeError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Replacement fees that satisfy BOTH floors:
 *   1. the node replacement rule (each rate >= original + 10%), and
 *   2. the live network rate (fee cap >= 2 x live base fee + tip), so a
 *      replacement of an old low-fee transaction is not itself stuck under the
 *      current base fee.
 *
 * The live numbers come from an untrusted RPC (I5), so they are bounded:
 *   - a live base fee above the per-network ceiling FAILS CLOSED (same rule as
 *     buildEvmTiers); it is never clamped into a signable value;
 *   - the live tip is clamped to [0, maxTipWei];
 *   - the live-derived fee cap is clamped to maxBaseFeeWei + maxTipWei, but never
 *     below the required 10% bump. If the required bump itself exceeds that
 *     ceiling the replacement fails closed.
 * All values are integer wei (BigInt).
 */
export function replacementFeesWithLiveFloor({
  maxFeePerGas,
  maxPriorityFeePerGas,
  liveBaseFeePerGas,
  liveTipWei,
  maxBaseFeeWei,
  maxTipWei,
}) {
  const bumped = bumpEip1559Fees({ maxFeePerGas, maxPriorityFeePerGas });
  const baseCap = asNonNegativeWei(maxBaseFeeWei, 'Base fee ceiling');
  const tipCap = asNonNegativeWei(maxTipWei, 'Tip ceiling');
  const ceiling = baseCap + tipCap;
  if (liveBaseFeePerGas == null) {
    throw feeError('REPLACEMENT_LIVE_FEE_UNAVAILABLE', 'The current network fee could not be read.');
  }
  const liveBase = BigInt(liveBaseFeePerGas);
  if (liveBase < 0n || liveBase > baseCap) {
    throw feeError('REPLACEMENT_LIVE_FEE_UNSAFE', 'The RPC returned an implausible network fee.');
  }
  const rawTip = liveTipWei == null ? 0n : BigInt(liveTipWei);
  const liveTip = rawTip < 0n ? 0n : (rawTip > tipCap ? tipCap : rawTip);

  const priority = bumped.maxPriorityFeePerGas > liveTip ? bumped.maxPriorityFeePerGas : liveTip;
  let liveCap = liveBase * 2n + priority;
  if (liveCap > ceiling) liveCap = ceiling;
  let maxFee = bumped.maxFeePerGas > liveCap ? bumped.maxFeePerGas : liveCap;
  if (maxFee < priority) maxFee = priority;
  if (maxFee > ceiling || priority > tipCap) {
    throw feeError('REPLACEMENT_FEE_UNSAFE', 'The required replacement fee is above this network’s safety ceiling.');
  }
  return {
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: priority,
    liveBaseFeePerGas: liveBase,
  };
}

