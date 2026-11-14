// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { PARTIAL_TOTAL_NOTE, UNPRICED_TOTAL_NOTE } from '@/lib/balanceDisplay';

const state = vi.hoisted(() => ({ portfolio: null }));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ isUnlocked: true }) }));
vi.mock('@/hooks/useAnalytics', () => ({ useAnalytics: () => ({ portfolio: state.portfolio }) }));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: vi.fn() }));
vi.mock('@/lib/recharts', () => ({
  RadarChart: () => null, Radar: () => null, PolarGrid: () => null,
  PolarAngleAxis: () => null, ResponsiveContainer: ({ children }) => children, Tooltip: () => null,
}));

import PortfolioRiskScore from '../PortfolioRiskScore.jsx';

afterEach(() => cleanup());

const base = { grandTotal: 0, assetTotals: {}, indeterminate: false, quoteUnavailable: false };

describe('PortfolioRiskScore — zero-value branch', () => {
  it('does not call confirmed unpriced holdings "no holdings"', () => {
    state.portfolio = { ...base, quoteUnavailable: true };
    const { container } = render(<PortfolioRiskScore />);
    expect(container.textContent).toContain(UNPRICED_TOTAL_NOTE);
    expect(container.textContent).not.toContain('No holdings to score yet');
  });

  it('keeps saying no holdings for a genuinely empty portfolio', () => {
    state.portfolio = { ...base };
    const { container } = render(<PortfolioRiskScore />);
    expect(container.textContent).toContain('No holdings to score yet');
  });

  it('still reports a failed read as a failed read, not as unpriced', () => {
    state.portfolio = { ...base, indeterminate: true, quoteUnavailable: true };
    const { container } = render(<PortfolioRiskScore />);
    expect(container.textContent).toContain(PARTIAL_TOTAL_NOTE);
    expect(container.textContent).not.toContain(UNPRICED_TOTAL_NOTE);
  });
});
