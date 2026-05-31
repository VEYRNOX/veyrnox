import { useState } from "react";
import { CURRENCY_COLORS, CURRENCY_SYMBOLS, logoFor } from "@/lib/cryptos";

const FALLBACK_COLOR = "#64748B";

// Renders the real bundled coin logo for a ticker, with a graceful fallback to
// the coloured-glyph circle for any symbol we don't ship a logo for (or if the
// image fails to load). One component for every coin badge across the app.
export default function CoinLogo({ symbol, size = 40, className = "" }) {
  const [errored, setErrored] = useState(false);
  const sym = String(symbol || "").toUpperCase();
  const color = CURRENCY_COLORS[sym] || FALLBACK_COLOR;
  const glyph = CURRENCY_SYMBOLS[sym] || sym[0] || "?";
  const dim = { width: size, height: size };

  if (errored || !sym) {
    return (
      <div
        className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
        style={{ ...dim, background: color + "20", color, fontSize: Math.round(size * 0.5) }}
      >
        {glyph}
      </div>
    );
  }

  return (
    <img
      src={logoFor(sym)}
      alt={sym}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      className={`rounded-full shrink-0 object-contain ${className}`}
      style={dim}
    />
  );
}
