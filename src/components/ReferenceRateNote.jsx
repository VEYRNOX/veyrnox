import { USD_REFERENCE_NOTE } from "@/lib/cryptos";

/**
 * Inline disclosure for any user-facing figure derived from the static
 * USD_RATES table. Single source for BOTH the wording (USD_REFERENCE_NOTE) and
 * its presentation, so every "reference rate, not live market data" caption
 * stays visually identical and can never drift between surfaces.
 */
export default function ReferenceRateNote({ className = "" }) {
  return (
    <p className={`text-[10px] text-muted-foreground mt-0.5 ${className}`}>
      {USD_REFERENCE_NOTE}
    </p>
  );
}
