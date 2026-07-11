// src/components/__tests__/CandlestickChart.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

vi.mock("@/lib/coinGecko", () => ({
  fetchOHLCVCG: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/priceFeed", () => ({
  isLivePricesEnabled: vi.fn().mockReturnValue(false),
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
import { fetchOHLCVCG } from "@/lib/coinGecko";
import { isLivePricesEnabled } from "@/lib/priceFeed";

const makeQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui, qc) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

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

test("shows 'Chart unavailable' when fetchOHLCVCG rejects", async () => {
  isLivePricesEnabled.mockReturnValue(true);
  fetchOHLCVCG.mockRejectedValue(new Error("network error"));
  const qc = makeQc();
  wrap(<CandlestickChart symbol="BTC" period="1D" />, qc);
  await waitFor(() => {
    expect(screen.getByText(/Chart unavailable/i)).toBeInTheDocument();
  });
});
