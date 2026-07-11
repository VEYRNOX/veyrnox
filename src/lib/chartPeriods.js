// src/lib/chartPeriods.js
export const PERIOD_PARAMS = {
  "1H": { resolution: "minute", limit: 60 },
  "4H": { resolution: "minute", limit: 240 },
  "1D": { resolution: "hour",   limit: 24 },
  "1W": { resolution: "hour",   limit: 168 },
  "1M": { resolution: "day",    limit: 30 },
};

export const PERIODS = ["1H", "4H", "1D", "1W", "1M"];
