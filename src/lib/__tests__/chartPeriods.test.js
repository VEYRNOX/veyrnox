// src/lib/__tests__/chartPeriods.test.js
//
// formatCandleTime — period-aware x-axis labels. Intraday periods show clock
// time; 1W and 1M candles span hours/days, so a clock time ("00:00") is
// meaningless there and dates must be shown instead.

import { describe, it, expect } from 'vitest';
import { PERIOD_PARAMS, PERIODS, formatCandleTime } from '../chartPeriods.js';

// 2026-07-14T09:05:00Z (a Tuesday)
const TS = Math.floor(Date.UTC(2026, 6, 14, 9, 5, 0) / 1000);

describe('formatCandleTime', () => {
  it('shows HH:MM for intraday periods (1H, 4H, 1D)', () => {
    for (const p of ['1H', '4H', '1D']) {
      expect(formatCandleTime(TS, p)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('shows weekday + day for 1W', () => {
    expect(formatCandleTime(TS, '1W')).toMatch(/^[A-Za-z]{3} \d{2}$/);
  });

  it('shows day + month for 1M', () => {
    expect(formatCandleTime(TS, '1M')).toMatch(/^\d{2} [A-Za-z]{3}$/);
  });

  it('falls back to HH:MM for unknown periods', () => {
    expect(formatCandleTime(TS, 'whatever')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('PERIOD_PARAMS', () => {
  it('covers every period in PERIODS', () => {
    for (const p of PERIODS) expect(PERIOD_PARAMS[p]).toBeTruthy();
  });
});
