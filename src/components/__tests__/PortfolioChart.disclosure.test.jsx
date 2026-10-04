// @ts-nocheck
// PortfolioChart prices its history from the static USD_RATES table whatever
// basis the current balance was priced on, so the disclosure must RENDER with
// the chart — usdDisclosure.test.js only proves a page's source names it.
import { render, screen } from "@testing-library/react";
import { test, expect, vi } from "vitest";

vi.mock("@/lib/recharts", () => {
  const Box = ({ children }) => <div>{children}</div>;
  const Nil = () => null;
  return { ResponsiveContainer: Box, AreaChart: Box, Area: Nil, XAxis: Nil, YAxis: Nil, Tooltip: Nil, CartesianGrid: Nil };
});

import PortfolioChart from "../PortfolioChart";
import { USD_REFERENCE_NOTE } from "@/lib/cryptos";

test("renders the reference-rate disclosure with the chart", () => {
  render(<PortfolioChart transactions={[]} currentBalance={1234} />);
  expect(screen.getByText(USD_REFERENCE_NOTE)).toBeInTheDocument();
});

test("still discloses when there is transaction history to price", () => {
  const tx = { created_date: new Date().toISOString(), amount: 1, currency: "ETH", type: "receive" };
  render(<PortfolioChart transactions={[tx]} currentBalance={5000} />);
  expect(screen.getByText(USD_REFERENCE_NOTE)).toBeInTheDocument();
});
