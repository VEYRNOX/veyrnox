// src/pages/__tests__/CryptoDetailPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { test, expect, vi, beforeEach } from "vitest";

const walletState = { isUnlocked: false, wallets: [], walletAddresses: [], activeWalletId: null };
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => walletState,
}));
vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      WalletToken: {
        list: vi.fn(async () => []),
      },
    },
  },
}));
vi.mock("@/lib/advisorBridge", () => ({
  openAdvisor: vi.fn(),
  publishAdvisorContext: vi.fn(),
}));
// Mutable so a test can turn the live feed on; reset to "not live" in beforeEach.
const basketState = /** @type {{ data: Record<string, { price: number, change24h: number }> | null }} */ ({ data: null });
vi.mock("@/hooks/useBasketPrices", () => ({
  useBasketPrices: () => ({
    priceFor: (s) => basketState.data?.[s]?.price ?? null,
    changeFor: (s) => basketState.data?.[s]?.change24h ?? null,
    isLive: !!basketState.data,
  }),
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
import { base44 } from "@/api/base44Client";

const walletTokenListMock = /** @type {any} */ (base44.entities.WalletToken.list);

beforeEach(() => {
  basketState.data = null;
  walletState.isUnlocked = false;
  walletState.wallets = [];
  walletState.walletAddresses = [];
  walletState.activeWalletId = null;
  walletTokenListMock.mockReset();
  walletTokenListMock.mockResolvedValue([]);
});

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
// Phase 1b: both routes registered, matching App.jsx's dual-route setup — the
// legacy /asset/:symbol entry point redirects (replace) to this canonical one.
const renderAt = (symbol) =>
  render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[`/asset/${symbol}`]}>
        <Routes>
          <Route path="/asset/:symbol" element={<CryptoDetailPage />} />
          <Route path="/asset/:symbol/:chain" element={<CryptoDetailPage />} />
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

test("legacy /asset/:symbol redirects to the canonical /asset/:symbol/:chain URL", async () => {
  renderAt("BTC");
  // First-match resolves BTC to chain 'mainnet' (wallet-core/assets.js); the
  // redirect effect fires on mount and swaps the route, re-rendering the same
  // page content at the canonical URL — content stays visible throughout.
  expect(await screen.findByText("Bitcoin")).toBeInTheDocument();
  expect(screen.getByText("BTC")).toBeInTheDocument();
});

test("renders suspicious token warning when spam-token clones share the asset symbol", async () => {
  walletState.isUnlocked = true;
  walletTokenListMock.mockResolvedValueOnce([
    { id: "clone", symbol: "USDC", name: "USDC-Rewards.com", value_usd: 0, balance: 5000, acquired_via: "airdrop", verified: false },
  ]);

  renderAt("USDC");
  expect(await screen.findByText(/suspicious usdc token copy detected/i)).toBeInTheDocument();
  expect(screen.getByText(/usdc-rewards\.com/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /ask ai advisor/i })).toBeInTheDocument();
});

// The header price used to be TOP_CRYPTOS[].usd — a hardcoded reference constant
// (BTC 68000, ETH 3200) rendered with no disclosure, directly above a LIVE chart.
test("header shows the live spot price, not the static reference constant", () => {
  basketState.data = { BTC: { price: 97123.45, change24h: 1.5 } };
  renderAt("BTC");
  expect(screen.getByTestId("asset-spot-price")).toHaveTextContent("97,123.45");
  expect(screen.queryByText(/68,000/)).not.toBeInTheDocument();
});

test("header renders NO price when the live feed is unavailable (I4: never a stale constant as a quote)", () => {
  renderAt("BTC");
  expect(screen.queryByTestId("asset-spot-price")).not.toBeInTheDocument();
  expect(screen.queryByText(/68,000/)).not.toBeInTheDocument();
});

test("ARB (native ETH on Arbitrum) prices and charts from the ETH feed via priceSymbol", () => {
  basketState.data = {
    ETH: { price: 4321.5, change24h: -2 },
    ARB: { price: 0.55, change24h: 9 },
  };
  renderAt("ARB");
  expect(screen.getByTestId("asset-spot-price")).toHaveTextContent("4,321.50");
  expect(screen.getByTestId("chart")).toHaveTextContent("ETH-1D");
  expect(screen.getByText(/2\.00%/)).toBeInTheDocument();
});
