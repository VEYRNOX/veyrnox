// lib/balanceDisplay.js — shared balance-display honesty helpers (I4 fail-closed).
//
// A balance read has THREE outcomes, not two: a number (read OK, INCLUDING a
// genuine 0 for an empty wallet) or `null` (read FAILED — offline / flaky RPC).
// A failed read is INDETERMINATE and must never be rendered as a confident "0"
// or "$0.00" — that understates as fact, the opposite of the code's I4 intent
// (see portfolioBalances.js). These pure helpers centralise the "—" convention
// (already used in WalletPortfolioPage) and the incomplete-total copy so every
// surface renders an indeterminate read identically. Session-agnostic: no
// isDecoy/isHidden branch — decoy and real sessions format identical data
// identically (portfolioBalances Finding 3 uniformity).

/** The glyph shown for an indeterminate (failed) read. Never "0". */
export const INDETERMINATE_DASH = '—';

/** Copy shown next to any total/derived figure that includes a failed read, so
 * an incomplete number is marked rather than presented as a confident fact. */
export const PARTIAL_TOTAL_NOTE =
  "Some balances couldn't be loaded — this total may be incomplete.";

/**
 * Format a possibly-indeterminate native amount for display.
 *   null / undefined → "—"  (read FAILED — I4 fail-closed, never "0")
 *   0                → "0"  (genuine empty wallet — a real, confirmed value)
 *   < 0.0001         → exponential (keeps tiny dust legible)
 *   otherwise        → locale-grouped, up to 6 fraction digits
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function fmtIndeterminateAmount(n) {
  if (n == null) return INDETERMINATE_DASH; // indeterminate: read failed
  if (n === 0) return '0'; // genuine empty wallet — confirmed, keep as "0"
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Resolve ONE asset's computed row from a wallet's asset list. A row that is
 * genuinely MISSING from the computed set (never fetched — e.g. a still-loading
 * portfolio or a race) is treated as INDETERMINATE, NOT a confident empty `0`:
 * we never assert an amount we did not read (I4 fail-closed). A present row is
 * returned verbatim, so a real `0` (empty wallet) is preserved as `0`.
 * @param {Array<{symbol:string, amount:number|null, usd:number|null, indeterminate?:boolean}>} assets
 * @param {string} symbol
 * @returns {{symbol:string, amount:number|null, usd:number|null, indeterminate?:boolean}}
 */
export function resolveAssetRow(assets, symbol) {
  const row = (assets || []).find((x) => x && x.symbol === symbol);
  if (row) return row;
  // Missing row → we never computed a value for it. Fail-closed to indeterminate
  // so the UI shows "—" (not a fabricated "0"/"$0.00").
  return { symbol, amount: null, usd: null, indeterminate: true };
}
