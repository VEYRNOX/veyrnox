// src/pages/__tests__/CryptoDetailPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { test, expect, vi } from "vitest";

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ isUnlocked: false, accounts: [], btcAccount: null, solAccount: null }),
}));
vi.mock("@/hooks/useBasketPrices", () => ({
  useBasketPrices: () => ({ changeFor: () => null, isLive: false }),
}));
vi.mock("@/components/CandlestickChart", () => ({
  default: ({ symbol, period }) => <div data-testid="chart">{symbol}-{period}</div>,
}));
vi.mock("@/lib/priceFeed", () => ({
  isLivePricesEnabled: () => false,
  // usePortfolio (via portfolioBalances) pulls useLivePrices from this module;
  // live prices are off in this test, so return the disabled-state shape.
  useLivePrices: () => ({ prices: null, isLoading: false, isError: false, updatedAt: null, refetch: () => {} }),
}));

import CryptoDetailPage from "../CryptoDetailPage";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (symbol) =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/asset/${symbol}`]}>
        <Routes>
          <Route path="/asset/:symbol" element={<CryptoDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

test("renders coin name and symbol for a known asset", () => {
  renderAt("BTC");
  expect(screen.getByText("Bitcoin")).toBeInTheDocument();
  expect(screen.getByText("BTC")).toBeInTheDocument();
});

test("renders Send and Receive buttons", () => {
  renderAt("ETH");
  expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /receive/i })).toBeInTheDocument();
});

test("renders chart with the correct symbol", () => {
  renderAt("SOL");
  expect(screen.getByTestId("chart")).toHaveTextContent("SOL");
});

test("renders 'Asset not found' for unknown symbol", () => {
  renderAt("UNKNOWN");
  expect(screen.getByText(/asset not found/i)).toBeInTheDocument();
});
