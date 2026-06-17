// wallet-core/amount.js
//
// ONE canonical decimal-amount validator for every send family. BTC/SOL convert
// via toBaseUnits (lib/sendDispatch.js) which used to own this rule; the EVM path
// converted with ethers parseEther/parseUnits and so validated DIFFERENTLY (it
// relied solely on the parser). Extracting the rule here lets all families reject
// the same malformed inputs — scientific notation ("1e-3"), signs, locale commas,
// multiple dots, over-precision, and non-positive amounts — before signing.

/**
 * Assert a human-entered decimal amount STRING is well-formed and positive for an
 * asset with `decimals` base-unit places. Throws (never silently truncates) on a
 * malformed, non-positive, or over-precise amount. Returns the trimmed string.
 *
 * Accepts "123", "123.45", ".45", "007"; rejects "", "0", "-1", "1.2.3", "1e-3",
 * "1." and anything with more than `decimals` fractional digits.
 *
 * @param {string} amountStr human amount
 * @param {number} decimals  base-unit decimals (ETH 18, USDC 6, BTC 8, SOL 9)
 * @returns {string} the trimmed, validated amount string
 */
export function assertDecimalAmount(amountStr, decimals) {
  const s = String(amountStr).trim();
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  const frac = s.includes('.') ? s.split('.')[1] : '';
  if (frac.length > decimals) {
    throw new Error(`Amount "${amountStr}" has more than ${decimals} decimal places.`);
  }
  if (!/[1-9]/.test(s)) {
    throw new Error(`Amount must be positive: "${amountStr}"`);
  }
  return s;
}
