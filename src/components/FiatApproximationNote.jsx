/**
 * Disclosure for non-USD fiat figures: the conversion uses fixed reference
 * rates (formatFiat), not a live FX feed, even when crypto prices are live.
 */
export default function FiatApproximationNote({ fiatCurrency }) {
  if (fiatCurrency === "USD") return null;
  return (
    <p role="note" className="text-xs text-muted-foreground mt-1">
      Approximate {fiatCurrency} values using fixed reference rates.
    </p>
  );
}
