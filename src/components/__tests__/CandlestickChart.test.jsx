// src/components/__tests__/CandlestickChart.test.jsx
import { render, screen } from "@testing-library/react";
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

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

test("renders chart container for a known symbol", () => {
  wrap(<CandlestickChart symbol="BTC" period="1D" />);
  expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
});

test("renders chart container for any string symbol", () => {
  wrap(<CandlestickChart symbol="ETH" period="1W" />);
  expect(screen.getByTestId("candlestick-chart")).toBeInTheDocument();
});
