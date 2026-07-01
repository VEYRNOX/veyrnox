/**
 * safeDate.js — safe date helpers for finance/analytics pages.
 * Guards against null/undefined/invalid dateish values that would otherwise
 * throw RangeError inside date-fns and blank the page.
 *
 * No crypto, keystore, signing, or auth logic is present here.
 */
import { format } from "date-fns";

/**
 * Returns a valid Date for `dateish`, or null if the value is
 * null/undefined/not-a-date/NaN-timestamp.
 *
 * @param {unknown} dateish
 * @returns {Date | null}
 */
export function safeDate(dateish) {
  if (dateish == null) return null;
  const d = new Date(/** @type {any} */ (dateish));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Safely formats a dateish value.
 *
 * - Returns `fallback` when `dateish` is null/undefined or produces an invalid
 *   Date (avoids the RangeError date-fns throws for invalid dates).
 * - When `fmtOrFn` is a string, delegates to date-fns `format(d, fmtOrFn)`.
 * - When `fmtOrFn` is a function, calls `fmtOrFn(d)` — useful for wrapping
 *   `formatDistanceToNow`, `differenceInDays`, etc.
 *
 * @param {unknown} dateish
 * @param {string | ((d: Date) => string | number)} fmtOrFn
 * @param {string} [fallback]
 * @returns {string | number}
 */
export function safeFormat(dateish, fmtOrFn, fallback = "—") {
  const d = safeDate(dateish);
  if (!d) return fallback;
  if (typeof fmtOrFn === "function") return fmtOrFn(d);
  return format(d, fmtOrFn);
}
