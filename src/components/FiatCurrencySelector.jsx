// @ts-nocheck
//
// Fiat display selector.
//
// Formatting goes through Intl.NumberFormat({ style: 'currency' }) resolved
// against the user's locale (lib/locale.js) — the previous implementation
// concatenated a hardcoded symbol with `toLocaleString()`, which:
//   - always put the symbol on the LEFT (wrong for many locales: `1.234,56 €`)
//   - forced 2 decimal places even for currencies that use 0 (JPY)
//   - hardcoded symbols that don't disambiguate (AUD vs USD both `$`)
//
// The FX-conversion rates are STILL hardcoded and stale (see lib/fiatCurrencies.js)
// — Phase 1 keeps the selector functional under the new formatting path; a live
// FX feed is out of scope (needs backend + I2/I3 review) and tracked separately.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveLocale } from "@/lib/locale";
import { FIAT_CURRENCIES } from "@/lib/fiatCurrencies";

// The catalogue itself lives in lib/fiatCurrencies.js — a pure data module with
// no imports. It must NOT live here: lib/locale.js derives SUPPORTED_FIAT from
// it at module-evaluation time, and this file imports resolveLocale back from
// lib/locale.js, so owning the map here creates a cycle that throws at module
// init whenever this component is evaluated first. Re-exported for the existing
// import sites; new code should import from lib/fiatCurrencies directly.
export { FIAT_CURRENCIES };


/**
 * Format a USD-denominated amount as a display string in the requested fiat.
 * Locale-aware via Intl.NumberFormat; the currency's own fraction-digit rule
 * applies (JPY → 0 dp, USD/EUR/GBP/AUD → 2 dp).
 */
export function formatFiat(usdAmount, fiatCurrency, locale) {
  const fiat = FIAT_CURRENCIES[fiatCurrency] || FIAT_CURRENCIES.USD;
  const currency = FIAT_CURRENCIES[fiatCurrency] ? fiatCurrency : 'USD';
  const converted = Number(usdAmount ?? 0) * fiat.rate;
  const value = Number.isFinite(converted) ? converted : 0;
  try {
    return new Intl.NumberFormat(locale || resolveLocale(), {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    // Extreme fallback: unknown locale/currency combination on the host.
    // Return a plain number with the ISO code so we never render a fabricated
    // symbol that misidentifies the currency (I4).
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(v:string)=>void} props.onChange
 * @param {string}  [props.triggerClassName]  Override the trigger classes to
 *   size the pill (defaults to a compact 20-wide × h-7 chip suited for
 *   inline placement next to other controls; Buy uses a larger form).
 * @param {boolean} [props.showName=false]  When true, each dropdown row is
 *   `CODE · Full Name` (e.g. `USD · US Dollar`) — matches the Send-style
 *   two-line asset picker that Buy uses. Default false keeps the existing
 *   compact "CODE only" list for other pages.
 */
export default function FiatCurrencySelector({
  value,
  onChange,
  triggerClassName = "w-20 h-7 text-xs border-0 bg-secondary",
  showName = false,
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Currency" className={triggerClassName}>
        <SelectValue>
          {value ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="text-base leading-none">{FIAT_CURRENCIES[value]?.flag ?? ""}</span>
              <span>{value}</span>
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {Object.keys(FIAT_CURRENCIES).map((code) => {
          const meta = FIAT_CURRENCIES[code];
          return (
            <SelectItem key={code} value={code} className={showName ? "text-sm" : "text-xs"}>
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">{meta.flag ?? ""}</span>
                {showName ? (
                  <span className="flex flex-col leading-tight">
                    <span className="font-medium">{code}</span>
                    <span className="text-xs text-muted-foreground">{meta.name || code}</span>
                  </span>
                ) : (
                  <span>{code}</span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
