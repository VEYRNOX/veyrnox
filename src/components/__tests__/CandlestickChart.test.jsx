// src/components/__tests__/CandlestickChart.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi, afterEach } from "vitest";

vi.mock("@/lib/ohlcv", () => ({
  fetchOHLCV: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/priceFeed", () => ({
  isLivePricesEnabled: vi.fn().mockReturnValue(false),
  setLivePricesEnabled: vi.fn(),
}));
vi.mock("@/lib/recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  ComposedChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));

import CandlestickChart from "../CandlestickChart";
import { fetchOHLCV } from "@/lib/ohlcv";
import { isLivePricesEnabled } from "@/lib/priceFeed";
import { setDeniabilitySession } from "@/wallet-core/deniabilitySession";

const makeQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui, qc) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

afterEach(() => {
  setDeniabilitySession(false);
  isLivePricesEnabled.mockReturnValue(false);
  fetchOHLCV.mockClear();
});

test("renders chart container for a known symbol", () => {
  const qc = makeQc();
  wrap(<CandlestickChart symbol="BTC" period="1D" />, qc);
  expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
});

test("renders chart container for any string symbol", () => {
  const qc = makeQc();
  wrap(<CandlestickChart symbol="ETH" period="1W" />, qc);
  expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
});

test("shows a generic 'Chart unavailable' message when fetchOHLCV rejects (no raw error text)", async () => {
  isLivePricesEnabled.mockReturnValue(true);
  fetchOHLCV.mockRejectedValue(new Error("coingecko HTTP 429"));
  const qc = makeQc();
  wrap(<CandlestickChart symbol="BTC" period="1D" />, qc);
  await waitFor(() => {
    expect(screen.getByText(/Chart unavailable/i)).toBeInTheDocument();
  });
  // H2 sanitisation pattern: raw provider errors must never render.
  expect(screen.queryByText(/429|coingecko|HTTP/i)).not.toBeInTheDocument();
});

test("I3: deniability session renders the prices-disabled state and makes zero egress", () => {
  isLivePricesEnabled.mockReturnValue(true);
  setDeniabilitySession(true);
  const qc = makeQc();
  wrap(<CandlestickChart symbol="BTC" period="1D" />, qc);
  expect(screen.getByText(/Live prices are disabled/i)).toBeInTheDocument();
  expect(fetchOHLCV).not.toHaveBeenCalled();
});
