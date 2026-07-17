// src/lib/chartPeriods.js
export const PERIOD_PARAMS = {
  "1H": { resolution: "minute", limit: 60 },
  "4H": { resolution: "minute", limit: 240 },
  "1D": { resolution: "hour",   limit: 24 },
  "1W": { resolution: "hour",   limit: 168 },
  "1M": { resolution: "day",    limit: 30 },
};

export const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

/**
 * Period-aware x-axis / tooltip label for a candle timestamp.
 * Intraday periods show clock time; 1W (4h–1h candles) and 1M (daily candles)
 * span hours/days, so a clock time ("00:00") is meaningless — show dates.
 * @param {number} tsSec  candle open time in UNIX seconds
 * @param {string} period one of PERIODS
 */
export function formatCandleTime(tsSec, period) {
  const d = new Date(tsSec * 1000);
  if (period === "1M") return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (period === "1W") return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" });
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
