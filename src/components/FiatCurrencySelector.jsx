import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const FIAT_CURRENCIES = {
  USD: { symbol: "$", rate: 1, label: "USD" },
  GBP: { symbol: "£", rate: 0.79, label: "GBP" },
  EUR: { symbol: "€", rate: 0.92, label: "EUR" },
  JPY: { symbol: "¥", rate: 149, label: "JPY" },
  AUD: { symbol: "A$", rate: 1.53, label: "AUD" },
};

export function formatFiat(usdAmount, fiatCurrency) {
  const fiat = FIAT_CURRENCIES[fiatCurrency] || FIAT_CURRENCIES.USD;
  const converted = usdAmount * fiat.rate;
  return `${fiat.symbol}${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function FiatCurrencySelector({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Currency" className="w-20 h-7 text-xs border-0 bg-secondary">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(FIAT_CURRENCIES).map(([code, { symbol, label }]) => (
          <SelectItem key={code} value={code} className="text-xs">
            {symbol} {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}