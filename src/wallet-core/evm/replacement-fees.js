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

