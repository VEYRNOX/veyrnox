// src/lib/locale.js — single source of truth for locale, timezone, fiat, and
// send-amount decimal canonicalisation.
//
// Two responsibilities in one leaf module:
//
// 1. USER PREFERENCES (locale / timezone / fiat) with an I3 WRITE-CHOKEPOINT.
//    The three preference keys below (`veyrnox-*`) live in SHARED localStorage:
//    whatever any session writes, the primary wallet reads. So a decoy /
//    duress / stealth / demo session must NEVER mutate them — a coerced tap
//    on the currency or language selector must not silently flip the real
//    user's setting, and must not force the real user to face an unexplained
//    UI change on next unlock. The guard lives HERE, not at each call site:
//    the consent module was written with per-call-site guards, a third writer
//    landed without one, and the coercion leak shipped (PR #1410). Reads
//    stay ungated — reading leaves no trace.
//
// 2. SEND-AMOUNT DECIMAL NORMALISATION. `isFormAmountWellFormed` and
//    `assertDecimalAmount` (wallet-core/amount.js — M-3) accept plain ASCII
//    decimals only. For a de-DE / fr-FR / es-ES user who types the natural
//    "1,5" the strict predicate would reject silently. `normalizeDecimalInput`
//    converts locale-formatted input into that ASCII shape WITHOUT weakening
//    the strict rules — anything it cannot unambiguously canonicalise is
//    returned unchanged so the downstream predicate still flags it.
//
// The safety story on ambiguous "1,5": in en-US that means "1 thousand 5" or
// a typo; silently rewriting to "15" would multiply the intended send by 10.
// So we treat a separator as a thousands mark only when it sits at a valid
// every-3-digit grouping position from the integer's right — "1,5" in en-US
// fails that test, is returned unchanged, and the user sees the same
// 'malformed' message they'd get for any other invalid input.
//
// deniabilitySession is a true leaf (zero imports), so gating here keeps this
// module acyclic.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

// ── Preference keys (shared localStorage) ─────────────────────────────────

export const LOCALE_KEY = 'veyrnox-locale';
export const TIMEZONE_KEY = 'veyrnox-timezone';
export const FIAT_KEY = 'veyrnox-fiat-currency';

/** Dispatched when any locale preference changes (locale, timezone, fiat).
 * Same-tab in-document notify, mirrors DENIABILITY_SESSION_CHANGED_EVENT. */
export const LOCALE_CHANGED_EVENT = 'veyrnox:locale-changed';

const FALLBACK_LOCALE = 'en-US';
const FALLBACK_TIMEZONE = 'UTC';
const FALLBACK_FIAT = 'USD';

// Supported fiat currencies (matches FiatCurrencySelector's set). Anything
// outside this set is treated as unset and falls through to the fallback.
export const SUPPORTED_FIAT = ['USD', 'GBP', 'EUR', 'JPY', 'AUD'];

// Best-effort read; localStorage throws on some Safari private-mode paths.
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ── Decimal / grouping helpers (send-amount canonicalisation) ─────────────

// U+0020 (space), U+00A0 (NBSP), U+202F (narrow NBSP), U+2009 (thin space).
// fr-FR / ru-RU emit narrow NBSP as the group char via Intl.NumberFormat;
// physical keyboards produce the regular ASCII space — accept both.
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
 * @param {string} [locale] BCP-47 tag (e.g. 'de-DE'). Defaults to resolveLocale().
 * @returns {string} canonical ASCII decimal, or the trimmed input unchanged.
 */
export function normalizeDecimalInput(input, locale) {
  const s = String(input ?? '').trim();
  if (!s) return '';

  const { decimal, group } = partsForLocale(locale || resolveLocale());
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

// ── Detection ─────────────────────────────────────────────────────────────

function detectBrowserLocale(nav) {
  const n = nav !== undefined
    ? nav
    : (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!n) return null;
  const first = Array.isArray(n.languages) ? n.languages[0] : undefined;
  if (typeof first === 'string' && first.length > 0) return first;
  if (typeof n.language === 'string' && n.language.length > 0) return n.language;
  return null;
}

function detectBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ── Resolvers ─────────────────────────────────────────────────────────────

/**
 * Locale-format a non-currency crypto amount for DISPLAY. Sibling of formatUsd
 * (currency style, USD-locked); this is the plain decimal style used for
 * balance cards, receive-address lines, tx-list rows — any "1.23456789 ETH"
 * / "0.001 BTC" cell. DISPLAY-ONLY: SendCrypto's signing path uses
 * canonicalAmount, not any formatted output.
 *
 * Default max precision is 8 fractional digits (BTC's satoshi scale — the
 * widest we display); trailing zeros are TRIMMED (minFractionDigits: 0) so
 * balance columns don't fill with visual noise. Callers who want a shorter
 * form pass `maximumFractionDigits`. The symbol suffix is appended verbatim
 * (never localised — "BTC" is a proper noun) with a single space, so a caller
 * who wrote `${amt} ETH` template-literally silently loses locale grouping.
 * Throws on non-finite input rather than rendering "NaN ETH" — balance
 * displays already have "reading from network…" / "—" placeholders for the
 * unknown case.
 *
 * @param {number} amount
 * @param {string} locale BCP-47 tag; falls back to Intl default if unresolvable.
 * @param {{ maximumFractionDigits?: number, minimumFractionDigits?: number, symbol?: string }} [opts]
 * @returns {string}
 */
export function formatCryptoAmount(amount, locale, opts) {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`formatCryptoAmount: expected finite number, got ${amount}`);
  }
  const max = opts?.maximumFractionDigits ?? 8;
  const min = opts?.minimumFractionDigits ?? 0;
  let out;
  try {
    out = new Intl.NumberFormat(locale, {
      maximumFractionDigits: max, minimumFractionDigits: min,
    }).format(amount);
  } catch {
    out = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: max, minimumFractionDigits: min,
    }).format(amount);
  }
  return opts?.symbol ? `${out} ${opts.symbol}` : out;
}

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
 * The `compact: true` opt switches Intl to `notation: 'compact'` — the
 * "$1K" / "$1.5M" / "$1B" form chart-axis ticks need. Locale-aware: de-DE
 * renders "1,5 Mio. $" for a million, not "$1.5M". Same throw / fallback
 * policy as standard mode; composes with `maximumFractionDigits` for tick
 * precision (`{ compact: true, maximumFractionDigits: 1 }` → "$1.5M").
 *
 * @param {number} usd
 * @param {string} locale BCP-47 tag; falls back to Intl default if unresolvable.
 * @param {{ maximumFractionDigits?: number, minimumFractionDigits?: number, compact?: boolean }} [opts]
 * @returns {string} e.g. "$1,650" (en-US), "1.650 $" (de-DE), "$1.5M" (compact en-US)
 */
export function formatUsd(usd, locale, opts) {
  if (!Number.isFinite(usd)) {
    throw new RangeError(`formatUsd: expected finite number, got ${usd}`);
  }
  const max = opts?.maximumFractionDigits ?? 0;
  const min = opts?.minimumFractionDigits ?? 0;
  const compact = opts?.compact === true;
  // JSDoc-typed so TS narrows the string-literal `style` / `notation` to their
  // Intl union types — extracting into a variable widened them to `string` and
  // failed the NumberFormat overload check (TS2769 on `tsc --noEmit`).
  /** @type {Intl.NumberFormatOptions} */
  const intlOpts = {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: max, minimumFractionDigits: min,
    ...(compact ? { notation: 'compact', compactDisplay: 'short' } : {}),
  };
  try {
    return new Intl.NumberFormat(locale, intlOpts).format(usd);
  } catch {
    // Locale tag unrecognised (rare — Intl is permissive). Fall back to the
    // runtime default so the number still renders, just without the caller's
    // locale preference. Better than throwing and blanking every USD cell.
    return new Intl.NumberFormat(undefined, intlOpts).format(usd);
  }
}

/**
 * Resolve the UI's BCP-47 locale. Accepts an options bag so tests can pass a
 * synthetic navigator without touching the global.
 *
 * @param {{ navigator?: { language?: string, languages?: readonly string[] } }} [opts]
 * @returns {string}
 */
export function resolveLocale(opts) {
  const stored = safeGet(LOCALE_KEY);
  if (stored) return stored;
  const nav = opts && 'navigator' in opts ? opts.navigator : undefined;
  return detectBrowserLocale(nav) || FALLBACK_LOCALE;
}

/**
 * Resolve the user's timezone. Order: stored preference → Intl-detected zone
 * → 'UTC'. Never throws; always returns a non-empty string.
 */
export function resolveTimeZone() {
  return safeGet(TIMEZONE_KEY) || detectBrowserTimeZone() || FALLBACK_TIMEZONE;
}

/**
 * Resolve the display fiat currency (ISO 4217). Order: stored preference (if
 * in SUPPORTED_FIAT) → 'USD'. Returns one of SUPPORTED_FIAT.
 *
 * Kept conservative: we do NOT infer a fiat from the locale (e.g. `fr-FR` →
 * EUR). Live FX is not wired (see cryptos.js USD_RATES / FiatCurrencySelector
 * hardcoded rates) — silently switching a French user to EUR would mean
 * quoting them a wrong number in a wrong currency. Explicit opt-in only.
 */
export function resolveFiatCurrency() {
  const stored = safeGet(FIAT_KEY);
  // tsc strict-null: safeGet returns string|null; narrow explicitly rather
  // than relying on .includes(null) short-circuiting.
  if (stored && SUPPORTED_FIAT.includes(stored)) return stored;
  return FALLBACK_FIAT;
}

// ── Persistence (I3-gated) ────────────────────────────────────────────────

function dispatchLocaleChanged() {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT));
    }
  } catch {}
}

/** Persist a locale preference. NO-OP in a decoy/demo session (I3). */
export function setLocale(locale) {
  if (isDeniabilityOrDemoActive()) return;
  if (typeof locale !== 'string' || !locale) return;
  safeSet(LOCALE_KEY, locale);
  dispatchLocaleChanged();
}

/** Persist a timezone preference. NO-OP in a decoy/demo session (I3). */
export function setTimeZone(timeZone) {
  if (isDeniabilityOrDemoActive()) return;
  if (typeof timeZone !== 'string' || !timeZone) return;
  safeSet(TIMEZONE_KEY, timeZone);
  dispatchLocaleChanged();
}

/** Persist a fiat currency preference. NO-OP in a decoy/demo session (I3).
 * Silently ignores codes outside SUPPORTED_FIAT (fail-closed). */
export function setFiatCurrency(code) {
  if (isDeniabilityOrDemoActive()) return;
  if (!SUPPORTED_FIAT.includes(code)) return;
  safeSet(FIAT_KEY, code);
  dispatchLocaleChanged();
}

/** Clear all stored preferences (returns the device to "never answered").
 * NO-OP in a decoy/demo session (I3). Panic-wipe uses this. */
export function clearLocalePreferences() {
  if (isDeniabilityOrDemoActive()) return;
  safeRemove(LOCALE_KEY);
  safeRemove(TIMEZONE_KEY);
  safeRemove(FIAT_KEY);
  dispatchLocaleChanged();
}
