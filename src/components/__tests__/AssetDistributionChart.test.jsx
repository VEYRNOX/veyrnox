// @ts-nocheck
import { render, screen } from "@testing-library/react";
import { test, expect, vi } from "vitest";

// recharts needs real layout; expose what the chart was given instead.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: ({ data }) => (
    <ul data-testid="pie">
      {data.map((d) => <li key={d.name}>{d.name}:{d.usd}:{d.percent}</li>)}
    </ul>
  ),
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import AssetDistributionChart from "../AssetDistributionChart";

test("renders the precomputed slices as given — no re-pricing through the static table", () => {
  render(<AssetDistributionChart slices={[{ name: "BTC", usd: 75000 }, { name: "ETH", usd: 25000 }]} />);
  const pie = screen.getByTestId("pie");
  expect(pie).toHaveTextContent("BTC:75000:75.0");
  expect(pie).toHaveTextContent("ETH:25000:25.0");
});

test("empty slices show the empty state", () => {
  render(<AssetDistributionChart slices={[]} />);
  expect(screen.getByText(/no assets to display/i)).toBeInTheDocument();
});

test("legacy demo path: {currency, balance} wallets still price via the reference table", () => {
  render(<AssetDistributionChart wallets={[{ currency: "USDC", balance: 10 }]} />);
  expect(screen.getByTestId("pie")).toHaveTextContent("USDC:10:100.0");
});
