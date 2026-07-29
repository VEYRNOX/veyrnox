// Locale-aware canonicalisation for the send-amount input.
//
// The downstream validators (`isFormAmountWellFormed`, `assertDecimalAmount` in
// wallet-core/amount.js — M-3 security control) accept plain ASCII decimals
// only. That's a security invariant, not a UX preference: the strict shape
// rules out ambiguous scientific notation and mixed separators before anything
// reaches the signer. This module is the one place that converts a locale-
// formatted input into that ASCII shape, WITHOUT weakening the strict rules —
// anything it cannot unambiguously canonicalise is returned unchanged so the
// downstream predicate still flags it.
//
// The unavoidable ambiguity: "1,5" reads as 1.5 in de-DE / fr-FR / es-ES and
// as an invalid thousands grouping in en-US. Silently rewriting en-US "1,5" to
// "15" would multiply the intended send by 10 — the exact class of silent
// misinterpretation this pipeline exists to prevent. So the rule is: only
// treat a separator as a thousands mark when it sits at a valid every-3-digit
// grouping position from the integer's right. "1,5" in en-US fails that test →
// returned unchanged → downstream flags it → the user sees 'malformed' and
// retypes.

const WHITESPACE_GROUP_CHARS = new Set([' ', ' ', ' ', ' ']);

function partsForLocale(locale) {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    const group = parts.find((p) => p.type === 'group')?.value ?? ',';
    return { decimal, group };
  } catch {
    return { decimal: '.', group: ',' };
  }
}

// Escape a single char for use in a RegExp character class or literal position.
function reEscape(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One char in the input that should be treated as a thousands separator for
// `locale`. For whitespace-group locales (fr-FR, ru-RU, …) also accept the
// regular ASCII space — that is what a physical keyboard produces.
function groupPattern(group) {
  if (WHITESPACE_GROUP_CHARS.has(group)) {
    return `[${[...WHITESPACE_GROUP_CHARS].map(reEscape).join('')}]`;
  }
  return reEscape(group);
}

/**
 * Canonicalise a user-typed amount string for the ASCII-strict downstream
 * validators. NEVER launders malformed input — anything not matching a valid
 * grouped or plain-decimal shape for `locale` is returned unchanged.
 *
 * @param {string|null|undefined} input
 * @param {string} locale BCP-47 tag (e.g. 'de-DE'). Falls back gracefully.
 * @returns {string} canonical ASCII decimal, or the trimmed input unchanged.
 */
export function normalizeDecimalInput(input, locale) {
  const s = String(input ?? '').trim();
  if (!s) return '';

  const { decimal, group } = partsForLocale(locale);
  const D = reEscape(decimal);
  const G = groupPattern(group);

  // Grouped integer, optional fractional part: "1.234.567,89" / "1,000,000.50".
  // Requires at least ONE grouping AND a 1–9 leading digit — a grouped number
  // never starts with 0. Without that, "0.001" in de-DE would parse as
  // "0" + group-3 → "0001", silently rewriting a legitimate small crypto amount
  // (0.001 ETH is a routine send) into something bigger.
  const grouped = new RegExp(`^([1-9]\\d{0,2}(?:${G}\\d{3})+)(?:${D}(\\d+))?$`);
  const gm = s.match(grouped);
  if (gm) {
    const intPart = gm[1].replace(new RegExp(G, 'g'), '');
    return gm[2] != null ? `${intPart}.${gm[2]}` : intPart;
  }

  // Simple locale-decimal form: integer + decimal separator + fractional.
  // Handles the whole reason this file exists — "1,5" de-DE → "1.5".
  const simple = new RegExp(`^(\\d+)${D}(\\d+)$`);
  const sm = s.match(simple);
  if (sm) return `${sm[1]}.${sm[2]}`;

  // Leading-decimal form: ".5" / ",5" — accept only the locale's own separator
  // (a "," here in en-US would still be invalid, kept unchanged).
  const leading = new RegExp(`^${D}(\\d+)$`);
  const lm = s.match(leading);
  if (lm) return `.${lm[1]}`;

  // Plain integer, no separators: keep exactly as typed.
  if (/^\d+$/.test(s)) return s;

  // Everything else — mixed separators, exponent, sign, letters, trailing dot,
  // broken groupings — round-trips unchanged so the strict predicate still
  // flags it. That is what keeps this helper from becoming a bypass around M-3.
  return s;
}

/**
 * Resolve the UI's BCP-47 locale. Accepts an options bag so tests can pass a
 * synthetic navigator without touching the global.
 *
 * @param {{ navigator?: { language?: string, languages?: readonly string[] } }} [opts]
 * @returns {string}
 */
/**
 * Locale-format a USD figure for DISPLAY. Never fed back into a parser — this
 * side of `locale.js` is DIRECTION-OUT (numbers → strings), while
 * normalizeDecimalInput is DIRECTION-IN (strings → numbers). SendCrypto's
 * signing path uses canonicalAmount, not any formatted output, so a display
 * formatter cannot leak into `parseEther` / `parseUnits` / `toBaseUnits`.
 *
 * Callers who need a fallback for missing / unknown rates apply it BEFORE
 * calling this — the helper's job is narrow: format a real finite number. It
 * THROWS on NaN / ±Infinity rather than rendering "NaN" or Intl's localised
 * NaN string, forcing the caller to decide site-appropriately what "no rate"
 * means (blank? em-dash? approxUsd's "≈$0"?). Bogus locale tags fall through
 * to Intl's own default rather than throwing — a stale navigator string must
 * not black-hole the whole USD column.
 *
 * @param {number} usd
 * @param {string} locale BCP-47 tag; falls back to Intl default if unresolvable.
 * @param {{ maximumFractionDigits?: number, minimumFractionDigits?: number }} [opts]
 * @returns {string} e.g. "$1,650" (en-US), "1.650 $" (de-DE)
 */
export function formatUsd(usd, locale, opts) {
  if (!Number.isFinite(usd)) {
    throw new RangeError(`formatUsd: expected finite number, got ${usd}`);
  }
  const max = opts?.maximumFractionDigits ?? 0;
  const min = opts?.minimumFractionDigits ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: max, minimumFractionDigits: min,
    }).format(usd);
  } catch {
    // Locale tag unrecognised (rare — Intl is permissive). Fall back to the
    // runtime default so the number still renders, just without the caller's
    // locale preference. Better than throwing and blanking every USD cell.
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: max, minimumFractionDigits: min,
    }).format(usd);
  }
}

export function resolveLocale(opts) {
  const nav = opts && 'navigator' in opts
    ? opts.navigator
    : (typeof navigator !== 'undefined' ? navigator : undefined);
  if (nav) {
    const first = Array.isArray(nav.languages) ? nav.languages[0] : undefined;
    if (typeof first === 'string' && first.length > 0) return first;
    if (typeof nav.language === 'string' && nav.language.length > 0) return nav.language;
  }
  return 'en-US';
}
