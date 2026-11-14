// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}));
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isUnlocked: true, wallets: [], walletAddresses: {} }),
}));
const portfolioState = { priceBasis: 'live' };
vi.mock('@/lib/portfolioBalances', () => ({
  usePortfolio: () => ({
    data: { grandTotal: 100, assetTotals: {} },
    isLoading: false,
    priceBasis: portfolioState.priceBasis,
    pricesUpdatedAt: null,
    refetchPrices: vi.fn(),
  }),
}));
const localeState = { fiatCurrency: 'GBP' };
vi.mock('@/lib/useLocale', () => ({
  useLocalePreferences: () => ({ locale: 'en-GB', fiatCurrency: localeState.fiatCurrency }),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: vi.fn() }));
vi.mock('@/components/CoinLogo', () => ({ default: () => null }));
vi.mock('recharts', () => ({
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

import NetWorthTracker from '@/pages/NetWorthTracker';

describe('NetWorthTracker fixed-rate fiat disclosure', () => {
  beforeEach(() => {
    portfolioState.priceBasis = 'live';
    localeState.fiatCurrency = 'GBP';
  });

  it('discloses fixed reference rates for a non-USD currency even when crypto prices are live', () => {
    render(<NetWorthTracker />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Approximate GBP values using fixed reference rates.',
    );
  });

  it('shows no fiat note for USD with live prices', () => {
    localeState.fiatCurrency = 'USD';
    render(<NetWorthTracker />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
