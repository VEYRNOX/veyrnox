// lib/fiatCurrencies.js
//
// The fiat catalogue, as a PURE data module with no React and no imports.
//
// This lives here rather than in components/FiatCurrencySelector.jsx because
// lib/locale.js derives SUPPORTED_FIAT from it at module-evaluation time. When
// the map lived in the component, locale.js had to import the component and the
// component imports resolveLocale back from locale.js — a cycle that throws
// `TypeError: Cannot convert undefined or null to object` at locale.js's
// `Object.keys(FIAT_CURRENCIES)` whenever the component happens to be evaluated
// first. It "worked" only because App.jsx pulls lib/locale into the root chunk
// before any component reaches it; a chunk-split change or a test that imports
// formatFiat first was enough to turn it into a blank screen.
//
// A lib/ module must not import a component. Both sides now import from here.
//
// The `rate` is USD→local, HARDCODED and STALE — used only for the wallet's
// display conversion of USD-denominated portfolio values into the user's chosen
// fiat. The on-ramp exchange rate is quoted live by Transak inside their widget
// at the point of purchase; nothing here influences what the user is charged. A
// live FX feed is out of scope (needs backend + I2/I3 review).
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
