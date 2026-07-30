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

// Global fiat set matching the on-ramp partner (Transak) coverage. The `rate`
// is USD→local, HARDCODED and STALE — used only for the wallet's display
// conversion of USD-denominated portfolio values into the user's chosen fiat.
// The actual on-ramp exchange rate is quoted live by Transak inside their
// widget at the point of purchase; nothing here influences what the user is
// charged. A live FX feed is out of scope (needs backend + I2/I3 review).
// Rates as of mid-2026 mid-market; refresh when the live feed lands.
export const FIAT_CURRENCIES = {
  // Americas
  USD: { rate: 1,      label: "USD", name: "US Dollar",         flag: "🇺🇸" },
  CAD: { rate: 1.37,   label: "CAD", name: "Canadian Dollar",   flag: "🇨🇦" },
  MXN: { rate: 17.1,   label: "MXN", name: "Mexican Peso",      flag: "🇲🇽" },
  BRL: { rate: 5.05,   label: "BRL", name: "Brazilian Real",    flag: "🇧🇷" },
  ARS: { rate: 950,    label: "ARS", name: "Argentine Peso",    flag: "🇦🇷" },
  COP: { rate: 4100,   label: "COP", name: "Colombian Peso",    flag: "🇨🇴" },
  CLP: { rate: 940,    label: "CLP", name: "Chilean Peso",      flag: "🇨🇱" },
  // Europe
  EUR: { rate: 0.92,   label: "EUR", name: "Euro",              flag: "🇪🇺" },
  GBP: { rate: 0.79,   label: "GBP", name: "British Pound",     flag: "🇬🇧" },
  CHF: { rate: 0.88,   label: "CHF", name: "Swiss Franc",       flag: "🇨🇭" },
  SEK: { rate: 10.5,   label: "SEK", name: "Swedish Krona",     flag: "🇸🇪" },
  NOK: { rate: 10.8,   label: "NOK", name: "Norwegian Krone",   flag: "🇳🇴" },
  DKK: { rate: 6.85,   label: "DKK", name: "Danish Krone",      flag: "🇩🇰" },
  PLN: { rate: 3.98,   label: "PLN", name: "Polish Zloty",      flag: "🇵🇱" },
  CZK: { rate: 23,     label: "CZK", name: "Czech Koruna",      flag: "🇨🇿" },
  HUF: { rate: 358,    label: "HUF", name: "Hungarian Forint",  flag: "🇭🇺" },
  RON: { rate: 4.55,   label: "RON", name: "Romanian Leu",      flag: "🇷🇴" },
  // Asia-Pacific
  JPY: { rate: 149,    label: "JPY", name: "Japanese Yen",      flag: "🇯🇵" },
  KRW: { rate: 1370,   label: "KRW", name: "South Korean Won",  flag: "🇰🇷" },
  HKD: { rate: 7.82,   label: "HKD", name: "Hong Kong Dollar",  flag: "🇭🇰" },
  SGD: { rate: 1.35,   label: "SGD", name: "Singapore Dollar",  flag: "🇸🇬" },
  TWD: { rate: 32,     label: "TWD", name: "Taiwan Dollar",     flag: "🇹🇼" },
  INR: { rate: 83.5,   label: "INR", name: "Indian Rupee",      flag: "🇮🇳" },
  IDR: { rate: 15900,  label: "IDR", name: "Indonesian Rupiah", flag: "🇮🇩" },
  PHP: { rate: 57,     label: "PHP", name: "Philippine Peso",   flag: "🇵🇭" },
  THB: { rate: 36,     label: "THB", name: "Thai Baht",         flag: "🇹🇭" },
  MYR: { rate: 4.72,   label: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾" },
  VND: { rate: 25400,  label: "VND", name: "Vietnamese Dong",   flag: "🇻🇳" },
  AUD: { rate: 1.53,   label: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
  NZD: { rate: 1.68,   label: "NZD", name: "New Zealand Dollar",flag: "🇳🇿" },
  // Middle East + Africa
  AED: { rate: 3.67,   label: "AED", name: "UAE Dirham",        flag: "🇦🇪" },
  SAR: { rate: 3.75,   label: "SAR", name: "Saudi Riyal",       flag: "🇸🇦" },
  ILS: { rate: 3.75,   label: "ILS", name: "Israeli Shekel",    flag: "🇮🇱" },
  TRY: { rate: 32,     label: "TRY", name: "Turkish Lira",      flag: "🇹🇷" },
  ZAR: { rate: 18.7,   label: "ZAR", name: "South African Rand",flag: "🇿🇦" },
  NGN: { rate: 1550,   label: "NGN", name: "Nigerian Naira",    flag: "🇳🇬" },
  KES: { rate: 129,    label: "KES", name: "Kenyan Shilling",   flag: "🇰🇪" },
  GHS: { rate: 15.8,   label: "GHS", name: "Ghanaian Cedi",     flag: "🇬🇭" },
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
