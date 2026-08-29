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
import { base44 } from "@/api/base44Client";

const walletTokenListMock = /** @type {any} */ (base44.entities.WalletToken.list);

beforeEach(() => {
  walletState.isUnlocked = false;
  walletState.wallets = [];
  walletState.walletAddresses = [];
  walletState.activeWalletId = null;
  walletTokenListMock.mockReset();
  walletTokenListMock.mockResolvedValue([]);
});

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (symbol) =>
  render(
    <QueryClientProvider client={makeClient()}>
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
