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
// The FX-conversion rates below are STILL hardcoded and stale — Phase 1 keeps
// the selector functional under the new formatting path; a live FX feed is
// out of scope (needs backend + I2/I3 review) and tracked separately.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveLocale } from "@/lib/locale";

export const FIAT_CURRENCIES = {
  USD: { rate: 1, label: "USD" },
  GBP: { rate: 0.79, label: "GBP" },
  EUR: { rate: 0.92, label: "EUR" },
  JPY: { rate: 149, label: "JPY" },
  AUD: { rate: 1.53, label: "AUD" },
};

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

export default function FiatCurrencySelector({ value, onChange, triggerClassName, showName }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Currency"
        className={triggerClassName ?? "w-20 h-7 text-xs border-0 bg-secondary"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(FIAT_CURRENCIES).map((code) => (
          <SelectItem key={code} value={code} className="text-xs">
            {showName ? `${code} — ${FIAT_CURRENCIES[code].label}` : code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
