import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/ohlcv', () => ({ fetchOHLCV: vi.fn() }));
vi.mock('@/lib/priceFeed', () => ({
  isLivePricesEnabled: vi.fn(() => true),
  setLivePricesEnabled: vi.fn(),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: vi.fn() }));
vi.mock('@/components/CandlestickChart', () => ({
  default: () => <div data-testid="candlestick-chart" />,
}));
vi.mock('@/lib/recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  ComposedChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
}));
vi.mock('lucide-react', () => ({
  TrendingUp: () => <span data-testid="trend-up" />,
  TrendingDown: () => <span data-testid="trend-down" />,
}));

import { fetchOHLCV } from '@/lib/ohlcv';
import PriceCharts from '../PriceCharts.jsx';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PriceCharts />
    </QueryClientProvider>
  );
  return client;
}

function expectUnavailableChange() {
  const change = screen.getByTestId('selected-period-change');
  expect(change).toHaveTextContent('— · 1D');
  expect(change).not.toHaveTextContent('%');
  expect(change.querySelector('svg')).toBeNull();
  expect(screen.queryByTestId('trend-up')).not.toBeInTheDocument();
  expect(screen.queryByTestId('trend-down')).not.toBeInTheDocument();
}

beforeEach(() => vi.clearAllMocks());

describe('PriceCharts missing OHLCV does not fabricate +0.00%', () => {
  it('renders price and change unavailable for an empty result', async () => {
    fetchOHLCV.mockResolvedValue([]);
    const client = renderPage();
    await waitFor(() => expect(client.getQueryState(['ohlcv', 'BTC', '1D'])?.status).toBe('success'));
    expect(screen.getByText('$—')).toBeInTheDocument();
    expectUnavailableChange();
  });

  it('renders price and change unavailable for an errored result', async () => {
    fetchOHLCV.mockRejectedValue(new Error('feed down'));
    const client = renderPage();
    await waitFor(() => expect(client.getQueryState(['ohlcv', 'BTC', '1D'])?.status).toBe('error'));
    expect(screen.getByText('$—')).toBeInTheDocument();
    expectUnavailableChange();
  });

  it('shows a single finite candle price but no invented directional change', async () => {
    fetchOHLCV.mockResolvedValue([{ time: 1, close: 100, volumefrom: 5 }]);
    renderPage();
    await waitFor(() => expect(screen.getByText('$100')).toBeInTheDocument());
    expectUnavailableChange();
  });

  it('does not divide by a zero first candle even when a later candle exists', async () => {
    fetchOHLCV.mockResolvedValue([
      { time: 1, close: 0, volumefrom: 5 },
      { time: 2, close: 2, volumefrom: 6 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('$2')).toBeInTheDocument());
    expectUnavailableChange();
  });
});
