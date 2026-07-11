# Crypto Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping any crypto on the home dashboard opens a detail page with a candlestick price chart, the user's balance, and Send / Receive buttons that deep-link into the existing flows with the asset pre-selected.

**Architecture:** Extract the candlestick chart rendering from `PriceCharts.jsx` into a reusable `CandlestickChart` component. Build a new `CryptoDetailPage` at `/asset/:symbol`. Wire up the existing asset rows and Send/Receive pages to use `?asset=` query params for pre-selection.

**Tech Stack:** React, React Router v6, @tanstack/react-query, Recharts (via `@/lib/recharts`), Tailwind CSS, lucide-react.

## Global Constraints

- Design system: `bg-card`, `border-border`, `text-muted-foreground`, teal `text-[#4ADAC2]` for positive change, `text-destructive` for negative, `mono-value` class for amounts/prices.
- I4 fail-honest: show `—` on balance read failure, never `0` for an indeterminate read.
- No security logic changes — this is UI routing only.
- All new files go in `src/pages/` or `src/components/` matching existing conventions.
- Test runner: `npx vitest run <testfile>` (the project uses vitest).

---

### Task 1: Extract `CandlestickChart` component from `PriceCharts.jsx`

**Files:**
- Create: `src/components/CandlestickChart.jsx`
- Modify: `src/pages/PriceCharts.jsx`
- Test: `src/components/__tests__/CandlestickChart.test.jsx`

**Interfaces:**
- Produces: `<CandlestickChart symbol="BTC" period="1D" />` — renders the full OHLCV chart (loading / error / data states). No period picker; caller controls `period`.

- [ ] **Step 1: Write the failing test**

```jsx
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
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/components/__tests__/CandlestickChart.test.jsx
```
Expected: FAIL — `CandlestickChart` not found.

- [ ] **Step 3: Create `src/components/CandlestickChart.jsx`**

```jsx
// src/components/CandlestickChart.jsx
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from "@/lib/recharts";
import { fetchOHLCVCG as fetchOHLCV } from "@/lib/coinGecko";
import { isLivePricesEnabled } from "@/lib/priceFeed";

const PERIOD_PARAMS = {
  "1H": { resolution: "minute", limit: 60 },
  "4H": { resolution: "minute", limit: 240 },
  "1D": { resolution: "hour",   limit: 24 },
  "1W": { resolution: "hour",   limit: 168 },
  "1M": { resolution: "day",    limit: 30 },
};

const CandlestickBar = (props) => {
  const { x, width, open, close, high, low, chartHeight, yMin, yRange } = props;
  if (!open || !close) return null;
  const isUp = close >= open;
  const color = isUp ? "#22C55E" : "#EF4444";
  const toY = (v) => ((1 - (v - yMin) / yRange) * chartHeight);
  const bodyTop = Math.min(toY(open), toY(close));
  const bodyH = Math.abs(toY(open) - toY(close)) || 1;
  const wickX = x + width / 2;
  return (
    <g>
      <line x1={wickX} x2={wickX} y1={toY(high)} y2={toY(low)} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={bodyTop} width={width - 2} height={bodyH} fill={color} opacity={0.9} />
    </g>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isUp = d.close >= d.open;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{d.time}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {[["O", d.open], ["H", d.high], ["L", d.low], ["C", d.close]].map(([l, v]) => (
          <p key={l}>
            <span className="text-muted-foreground">{l} </span>
            <span className={`font-semibold ${l === "C" ? (isUp ? "text-success" : "text-destructive") : ""}`}>
              ${v?.toFixed(2)}
            </span>
          </p>
        ))}
      </div>
      <p className="mt-1">
        <span className="text-muted-foreground">Vol </span>
        <span className="font-semibold">{(d.volume / 1000).toFixed(0)}K</span>
      </p>
    </div>
  );
};

const CHART_H = 280;

export default function CandlestickChart({ symbol, period }) {
  const livePricesOn = isLivePricesEnabled();
  const { resolution, limit } = PERIOD_PARAMS[period] || PERIOD_PARAMS["1D"];

  const { data: rawCandles, isLoading, isError, error } = useQuery({
    queryKey: ["ohlcv", symbol, period],
    queryFn: () => fetchOHLCV(symbol, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  const data = (rawCandles ?? []).map((d) => ({
    open: d.open, close: d.close, high: d.high, low: d.low,
    volume: d.volumefrom,
    price: d.close,
    time: new Date(d.time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));

  const prices = data.map((d) => d.price);
  const yMin = prices.length ? Math.min(...prices) * 0.998 : 0;
  const yMax = prices.length ? Math.max(...prices) * 1.002 : 1;
  const yRange = yMax - yMin || 1;
  const firstPrice = data[0]?.price;
  const ticks = data.length
    ? data.filter((_, i) => i % Math.floor(data.length / 6) === 0).map((d) => d.time)
    : [];

  return (
    <div data-testid="candlestick-chart" className="p-4 rounded-xl border border-border bg-card">
      {!livePricesOn && (
        <p className="text-xs text-muted-foreground text-center py-6">
          Enable live prices to view chart data.
        </p>
      )}
      {livePricesOn && isLoading && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-2 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading chart…
        </div>
      )}
      {livePricesOn && isError && (
        <p className="text-xs text-destructive text-center py-6">
          Chart unavailable: {error?.message ?? "unknown error"}
        </p>
      )}
      {livePricesOn && !isLoading && !isError && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`}
              axisLine={false} tickLine={false} width={52}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
            {firstPrice && (
              <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
            )}
            <Bar
              dataKey="close"
              shape={(props) => {
                const p = /** @type {any} */ (props);
                return <CandlestickBar {...p} open={p.open} close={p.close} high={p.high} low={p.low} chartHeight={CHART_H} yMin={yMin} yRange={yRange} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `PriceCharts.jsx` to use `CandlestickChart`**

Replace lines 26–200 of `src/pages/PriceCharts.jsx` — keep the page shell, asset selector, price header, period picker, volume bar — but replace the inner chart block with `<CandlestickChart symbol={selected} period={period} />`.

The file should look like this after the edit:

```jsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Bar } from "@/lib/recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { fetchOHLCVCG as fetchOHLCV } from "@/lib/coinGecko";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
import CandlestickChart from "@/components/CandlestickChart";

const ASSETS = TOP_CRYPTOS.map((c) => ({
  symbol: c.symbol, name: c.name, price: c.usd, change24h: c.change24h, color: c.color, mcap: c.mcap,
}));

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

const PERIOD_PARAMS = {
  "1H": { resolution: "minute", limit: 60 },
  "4H": { resolution: "minute", limit: 240 },
  "1D": { resolution: "hour",   limit: 24 },
  "1W": { resolution: "hour",   limit: 168 },
  "1M": { resolution: "day",    limit: 30 },
};

export default function PriceCharts() {
  const [selected, setSelected] = useState("BTC");
  const [period, setPeriod] = useState("1D");

  const livePricesOn = isLivePricesEnabled();
  const asset = ASSETS.find((a) => a.symbol === selected);
  const { resolution, limit } = PERIOD_PARAMS[period];

  // Volume bar still needs its own query (same queryKey — cached, no double-fetch).
  const { data: rawCandles } = useQuery({
    queryKey: ["ohlcv", selected, period],
    queryFn: () => fetchOHLCV(selected, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  const data = (rawCandles ?? []).map((d) => ({
    close: d.close,
    volume: d.volumefrom,
    price: d.close,
    time: new Date(d.time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));

  const prices = data.map((d) => d.price);
  const firstPrice = data[0]?.price;
  const lastPrice = data[data.length - 1]?.price;
  const change = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2) : "0.00";
  const isUp = parseFloat(change) >= 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Price Charts</h1>
        <p className="text-sm text-muted-foreground">Candlestick charts for major assets</p>
      </div>

      {!livePricesOn && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Live prices are disabled. Enable them to view real chart data.</span>
          <button
            onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="shrink-0 rounded-lg bg-caution/20 px-3 py-1.5 text-xs font-semibold text-caution hover:bg-caution/30 transition-colors"
          >
            Enable
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {ASSETS.map((a) => (
          <button key={a.symbol} onClick={() => livePricesOn && setSelected(a.symbol)}
            disabled={!livePricesOn}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0 transition-colors ${selected === a.symbol ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}
            style={selected === a.symbol ? { backgroundColor: a.color } : {}}>
            {a.symbol}
            <span className={`text-[10px] ${a.change24h >= 0 ? "text-success" : "text-destructive"}`}>
              {a.change24h >= 0 ? "+" : ""}{a.change24h}%
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold">${lastPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</p>
          <div className={`flex items-center gap-1 mt-0.5 text-sm font-medium ${isUp ? "text-success" : "text-destructive"}`}>
            {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {isUp ? "+" : ""}{change}% · {period}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Mkt Cap ${asset.mcap}</p>
          <p className="mt-0.5">{asset.name}</p>
        </div>
      </div>

      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} disabled={!livePricesOn}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}>
            {p}
          </button>
        ))}
      </div>

      <CandlestickChart symbol={selected} period={period} />

      {(!livePricesOn || data.length > 0) && (
        <div className={`p-4 rounded-xl border border-border bg-card ${!livePricesOn ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-xs text-muted-foreground mb-2 font-semibold">Volume</p>
          <ResponsiveContainer width="100%" height={60}>
            <ComposedChart data={data}>
              <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.4} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/components/__tests__/CandlestickChart.test.jsx
```
Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CandlestickChart.jsx src/components/__tests__/CandlestickChart.test.jsx src/pages/PriceCharts.jsx
git commit -m "feat: extract CandlestickChart component from PriceCharts"
```

---

### Task 2: Create `CryptoDetailPage`

**Files:**
- Create: `src/pages/CryptoDetailPage.jsx`
- Test: `src/pages/__tests__/CryptoDetailPage.test.jsx`

**Interfaces:**
- Consumes: `CandlestickChart` from Task 1, `BackButton` from `src/components/BackButton.jsx`, `CoinLogo` from `src/components/CoinLogo.jsx`, `useWallet` from `@/lib/WalletProvider`, `useBasketPrices` from `@/hooks/useBasketPrices`, `TOP_CRYPTOS` from `@/lib/cryptos`, `useParams` / `useNavigate` from react-router-dom.
- Produces: default export `CryptoDetailPage` — a page component for route `/asset/:symbol`.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/pages/__tests__/CryptoDetailPage.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ isUnlocked: false, accounts: [], btcAccount: null, solAccount: null }),
}));
vi.mock("@/hooks/useBasketPrices", () => ({
  useBasketPrices: () => ({ changeFor: () => null, isLive: false }),
}));
vi.mock("@/components/CandlestickChart", () => ({
  default: ({ symbol, period }) => <div data-testid="chart">{symbol}-{period}</div>,
}));
vi.mock("@/lib/priceFeed", () => ({ isLivePricesEnabled: () => false }));

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
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/pages/__tests__/CryptoDetailPage.test.jsx
```
Expected: FAIL — `CryptoDetailPage` not found.

- [ ] **Step 3: Create `src/pages/CryptoDetailPage.jsx`**

```jsx
// src/pages/CryptoDetailPage.jsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/BackButton";
import CoinLogo from "@/components/CoinLogo";
import CandlestickChart from "@/components/CandlestickChart";
import { useWallet } from "@/lib/WalletProvider";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { resolveReceive } from "@/lib/receiveAddress";

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

const fmtAmount = (n) =>
  n == null ? "—"
    : n === 0 ? "0"
    : n < 0.0001 ? n.toExponential(2)
    : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

export default function CryptoDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("1D");
  const { isUnlocked, accounts, btcAccount, solAccount } = useWallet();
  const { changeFor } = useBasketPrices();

  const asset = TOP_CRYPTOS.find((c) => c.symbol === symbol);

  if (!asset) {
    return (
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <BackButton />
        <p className="text-sm text-muted-foreground text-center pt-8">Asset not found: {symbol}</p>
      </div>
    );
  }

  const change = changeFor(symbol);
  const isUp = change == null ? null : change >= 0;

  // Balance: resolve the receive address for this asset — same derivation path the
  // wallet already did; we read the amount from the portfolio's resolved accounts.
  // For simplicity we show balance from WalletProvider accounts (EVM) or chain-specific
  // accounts. If unlocked we show what we have; if not, show nothing.
  const receive = isUnlocked
    ? resolveReceive(symbol, { accounts, btcAccount, solAccount })
    : null;

  // Per-asset balance comes from the underlying account balance field if present.
  // This is a display-only read; no new derivation.
  const balanceAmount = receive?.balance ?? null;

  return (
    <div className="max-w-lg mx-auto space-y-5 pt-1">
      {/* Back */}
      <BackButton />

      {/* Header */}
      <div className="flex items-center gap-3">
        <CoinLogo symbol={symbol} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{asset.name}</h1>
            <span className="text-sm text-muted-foreground font-mono">{symbol}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-lg font-semibold mono-value">
              ${asset.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {isUp != null && (
              <span className={`text-xs font-mono ${isUp ? "text-[#4ADAC2]" : "text-destructive"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Balance strip — hidden when not unlocked */}
      {isUnlocked && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
          <div>
            <p className="text-xs text-muted-foreground">Your balance</p>
            <p className="text-sm font-semibold mono-value mt-0.5">
              {fmtAmount(balanceAmount)} {symbol}
            </p>
          </div>
          {balanceAmount != null && (
            <p className="text-xs text-muted-foreground mono-value">
              ${(balanceAmount * asset.usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      )}

      {/* Period tabs */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <CandlestickChart symbol={symbol} period={period} />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button
          className="h-14 gap-2 text-base"
          onClick={() => navigate(`/send?asset=${symbol}`)}
        >
          <ArrowUpRight className="h-5 w-5" />
          Send
        </Button>
        <Button
          variant="secondary"
          className="h-14 gap-2 text-base"
          onClick={() => navigate(`/receive?asset=${symbol}`)}
        >
          <ArrowDownLeft className="h-5 w-5" />
          Receive
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/pages/__tests__/CryptoDetailPage.test.jsx
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CryptoDetailPage.jsx src/pages/__tests__/CryptoDetailPage.test.jsx
git commit -m "feat: add CryptoDetailPage at /asset/:symbol"
```

---

### Task 3: Register the route in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `CryptoDetailPage` from Task 2.

- [ ] **Step 1: Add the lazy import**

In `src/App.jsx`, after the existing `const PriceCharts = lazy(...)` line (~line 79), add:

```js
const CryptoDetailPage = lazy(() => import('./pages/CryptoDetailPage'));
```

- [ ] **Step 2: Add the route**

In the `<Routes>` block in `src/App.jsx`, after the `/receive` route (line 140), add:

```jsx
<Route path="/asset/:symbol" element={<CryptoDetailPage />} />
```

- [ ] **Step 3: Verify the app starts (visual check)**

```
npm run dev
```
Navigate to `http://localhost:5173/asset/BTC` in a browser. Expected: the Bitcoin detail page renders (back button, BTC header, chart placeholder or chart, Send/Receive buttons). No console errors about missing routes.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: register /asset/:symbol route"
```

---

### Task 4: Make asset rows in `WalletPortfolioPage` navigate to detail page

**Files:**
- Modify: `src/pages/WalletPortfolioPage.jsx`
- Test: `src/pages/__tests__/WalletPortfolioPage.assetNav.test.jsx`

**Interfaces:**
- Consumes: `useNavigate` (already imported in the file).

- [ ] **Step 1: Write the failing test**

```jsx
// src/pages/__tests__/WalletPortfolioPage.assetNav.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    isUnlocked: true,
    wallets: [{ id: "w1", name: "My Wallet", backedUp: true, enabledAssets: ["ETH", "BTC"], enabledPortfolios: [] }],
    activeWalletId: "w1",
    switchWallet: vi.fn(),
    walletAddresses: {},
    confirmWalletBackup: vi.fn(),
    isDecoy: false, isHidden: false,
    portfolios: [{ id: "main", name: "Main" }],
    activePortfolioId: "main",
    setActivePortfolio: vi.fn(),
    walletPortfolioMap: {},
    requireWallet: vi.fn(),
    assignWalletToPortfolio: vi.fn(),
    renameWallet: vi.fn(),
    removeWallet: vi.fn(),
    createPortfolio: vi.fn(),
    renamePortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
    toggleWalletAsset: vi.fn(),
  }),
}));
vi.mock("@/lib/portfolioBalances", () => ({
  usePortfolio: () => ({ data: { byWallet: { w1: { assets: [], total: 5000, indeterminate: false } } }, isLoading: false, priceBasis: "live", pricesUpdatedAt: null, refetchPrices: vi.fn() }),
  sumPortfolioTotal: () => ({ total: 5000, indeterminate: false }),
}));
vi.mock("@/lib/balanceDisplay", () => ({
  resolveAssetRow: () => ({ amount: 1.5, usd: 4800, indeterminate: false }),
  PARTIAL_TOTAL_NOTE: "",
}));
vi.mock("@/components/FiatCurrencySelector", () => ({ formatFiat: (v) => `$${v}` }));
vi.mock("@/components/ReferenceRateNote", () => ({ default: () => null }));
vi.mock("@/components/QuickAccessGrid", () => ({ default: () => null }));
vi.mock("@/components/SpendingPatternsCard", () => ({ default: () => null }));
vi.mock("@/components/security/HiddenWallet2faGate", () => ({ default: () => null }));
vi.mock("@/components/security/useRevealWithReauth", () => ({
  useRevealWithReauth: () => ({ revealWithReauth: vi.fn(), reauthPrompt: null, isReauthPending: false, pendingWalletId: null, cancelReauth: vi.fn(), gateModal: null }),
}));

import WalletPortfolioPage from "../WalletPortfolioPage";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = () =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WalletPortfolioPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

test("clicking an asset row navigates to /asset/:symbol", () => {
  wrap();
  const ethRow = screen.getByRole("button", { name: /ETH/i });
  fireEvent.click(ethRow);
  expect(mockNavigate).toHaveBeenCalledWith("/asset/ETH");
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/pages/__tests__/WalletPortfolioPage.assetNav.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Edit `WalletPortfolioPage.jsx` asset rows**

Find the asset row `<div>` block at around line 552 (inside `walletCards`):

```jsx
<div key={symbol} className="flex items-center gap-3 px-4 py-2.5">
```

Replace it with a navigable button:

```jsx
<button
  key={symbol}
  type="button"
  aria-label={symbol}
  onClick={() => navigate(`/asset/${symbol}`)}
  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors cursor-pointer text-left"
>
```

And change the closing `</div>` for that element to `</button>`.

- [ ] **Step 4: Run test**

```
npx vitest run src/pages/__tests__/WalletPortfolioPage.assetNav.test.jsx
```
Expected: 1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/WalletPortfolioPage.jsx src/pages/__tests__/WalletPortfolioPage.assetNav.test.jsx
git commit -m "feat: asset rows in WalletPortfolioPage navigate to detail page"
```

---

### Task 5: Make `TokenList` rows navigate to detail page

**Files:**
- Modify: `src/components/TokenList.jsx`
- Test: `src/components/__tests__/TokenList.assetNav.test.jsx`

**Interfaces:**
- The `onSelect` prop is still called (backwards compat for any consumer that uses it), then navigation fires.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/__tests__/TokenList.assetNav.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/hooks/useBasketPrices", () => ({
  useBasketPrices: () => ({ changeFor: () => 2.3, isLive: true }),
}));
vi.mock("@/components/CoinLogo", () => ({ default: ({ symbol }) => <span>{symbol}</span> }));

import TokenList from "../TokenList";

const wallets = [
  { id: "1", currency: "ETH", name: "My ETH", balance: 1.5 },
  { id: "2", currency: "BTC", name: "My BTC", balance: 0.05 },
];

test("clicking a token row navigates to /asset/:symbol", () => {
  render(
    <MemoryRouter>
      <TokenList wallets={wallets} onSelect={() => {}} selectedId={null} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /ETH/i }));
  expect(mockNavigate).toHaveBeenCalledWith("/asset/ETH");
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/components/__tests__/TokenList.assetNav.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Edit `TokenList.jsx`**

Add `useNavigate` import at the top:

```jsx
import { useNavigate } from "react-router-dom";
```

At the start of the `TokenList` component function, add:

```jsx
const navigate = useNavigate();
```

In the `onClick` handler on each wallet button, change:

```jsx
onClick={() => onSelect(wallet)}
```

to:

```jsx
onClick={() => { onSelect(wallet); navigate(`/asset/${wallet.currency}`); }}
```

- [ ] **Step 4: Run test**

```
npx vitest run src/components/__tests__/TokenList.assetNav.test.jsx
```
Expected: 1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TokenList.jsx src/components/__tests__/TokenList.assetNav.test.jsx
git commit -m "feat: TokenList rows navigate to /asset/:symbol"
```

---

### Task 6: Pre-select asset in `SendCrypto` via `?asset=` param

**Files:**
- Modify: `src/pages/SendCrypto.jsx`
- Test: `src/pages/__tests__/SendCrypto.assetParam.test.jsx`

**Interfaces:**
- Reads `?asset=ETH` from URL search params and uses it as the initial `assetSymbol` state.
- The existing `defaultAssetSymbol` clamping effect (runs when wallet changes) must not override a valid initial selection. It already only clamps when the current value isn't in the enabled list — no further change needed.

- [ ] **Step 1: Write the failing test**

```jsx
// src/pages/__tests__/SendCrypto.assetParam.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

// Minimal mocks so SendCrypto doesn't crash on import
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({
    isUnlocked: true,
    wallets: [],
    accounts: [],
    btcAccount: null,
    solAccount: null,
    activeWalletId: null,
  }),
}));
vi.mock("@/lib/cryptos", () => ({
  USD_RATES: { ETH: 3200, BTC: 68000 },
  approxUsd: (v) => v,
  USD_REFERENCE_NOTE: "",
}));
vi.mock("@/lib/devSendOverride", () => ({ isDevSendUngated: () => false }));
vi.mock("@/api/demoClient", () => ({ DEMO: false, DEMO_POISON_ADDRESS: "" }));
vi.mock("@/rasp", () => ({ degrade: () => {}, detect: () => ({}), TIER: { BLOCK: "BLOCK" }, browserProbeSource: () => "" }));
vi.mock("@/lib/sendWalletSource", () => ({
  defaultWalletId: () => null,
  sendAssetSymbols: () => ["ETH", "BTC"],
  defaultAssetSymbol: (_enabled, cur) => cur || "ETH",
  buildSendWallet: () => null,
  demoSendSource: () => null,
}));
vi.mock("@/wallet-core/assets", () => ({
  getAsset: () => null,
  canSend: () => false,
  canReceive: () => true,
  isEvmFamily: () => false,
  ASSETS: [],
}));
vi.mock("@/wallet-core/evm/networks", () => ({
  getNetworkInfo: () => null,
  ALLOW_MAINNET: false,
}));
vi.mock("@/context/TrezorContext.jsx", () => ({ useTrezor: () => ({}) }));
vi.mock("@/lib/TierProvider", () => ({ useTier: () => ({ tier: "free" }) }));

import SendCrypto from "../SendCrypto";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (url) =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/send" element={<SendCrypto />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

test("initialises assetSymbol from ?asset= query param", () => {
  renderAt("/send?asset=BTC");
  // The asset selector should show BTC as selected
  expect(screen.getByDisplayValue("BTC")).toBeInTheDocument();
});

test("defaults to empty string when no ?asset= param", () => {
  renderAt("/send");
  // No specific asset pre-selected — the select shows placeholder / empty
  const selects = screen.queryAllByDisplayValue("BTC");
  expect(selects.length).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/pages/__tests__/SendCrypto.assetParam.test.jsx
```
Expected: FAIL.

- [ ] **Step 3: Edit `SendCrypto.jsx`**

At the top of the file, add `useSearchParams` to the react-router-dom import (it's already using `useNavigate`):

```js
import { useNavigate, useSearchParams } from "react-router-dom";
```

Inside the `SendCrypto` function, before the `const [assetSymbol, setAssetSymbol] = useState("")` line (around line 143), add:

```js
const [searchParams] = useSearchParams();
```

Then change the `assetSymbol` state initialiser from:

```js
const [assetSymbol, setAssetSymbol] = useState("");
```

to:

```js
const [assetSymbol, setAssetSymbol] = useState(searchParams.get("asset") ?? "");
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/pages/__tests__/SendCrypto.assetParam.test.jsx
```
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SendCrypto.jsx src/pages/__tests__/SendCrypto.assetParam.test.jsx
git commit -m "feat: SendCrypto reads ?asset= param to pre-select asset"
```

---

### Task 7: Pre-select asset in `ReceiveCrypto` via `?asset=` param

**Files:**
- Modify: `src/pages/ReceiveCrypto.jsx`
- Test: `src/pages/__tests__/ReceiveCrypto.assetParam.test.jsx`

**Interfaces:**
- Reads `?asset=BTC` from URL search params and uses it as the initial `symbol` state (was hardcoded to `"ETH"`).

- [ ] **Step 1: Write the failing test**

```jsx
// src/pages/__tests__/ReceiveCrypto.assetParam.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => ({ isUnlocked: false, accounts: [], btcAccount: null, solAccount: null }),
}));
vi.mock("@/api/demoClient", () => ({ DEMO: false }));
vi.mock("@/lib/sendWalletSource", () => ({ demoSendSource: () => null }));
vi.mock("@/lib/receiveAddress", () => ({
  resolveReceive: (sym) => ({ address: `0xabc-${sym}`, network: { name: "Testnet" }, family: "evm", isErc20: false, asset: { symbol: sym, name: sym, chain: "Ethereum" } }),
}));
vi.mock("@/components/QRCodeDisplay", () => ({ default: () => null }));
vi.mock("@/components/CoinLogo", () => ({ default: ({ symbol }) => <span>{symbol}</span> }));

import ReceiveCrypto from "../ReceiveCrypto";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderAt = (url) =>
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/receive" element={<ReceiveCrypto />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

test("pre-selects asset from ?asset= query param", () => {
  renderAt("/receive?asset=BTC");
  expect(screen.getByDisplayValue("BTC")).toBeInTheDocument();
});

test("defaults to ETH when no ?asset= param", () => {
  renderAt("/receive");
  expect(screen.getByDisplayValue("ETH")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/pages/__tests__/ReceiveCrypto.assetParam.test.jsx
```
Expected: FAIL — `?asset=BTC` not pre-selected.

- [ ] **Step 3: Edit `ReceiveCrypto.jsx`**

Add `useSearchParams` to the react-router-dom import at the top (currently only `Link` is imported):

```js
import { Link, useSearchParams } from "react-router-dom";
```

Inside `ReceiveCrypto`, before the `const [symbol, setSymbol] = useState("ETH")` line, add:

```js
const [searchParams] = useSearchParams();
```

Change:

```js
const [symbol, setSymbol] = useState("ETH");
```

to:

```js
const [symbol, setSymbol] = useState(searchParams.get("asset") ?? "ETH");
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/pages/__tests__/ReceiveCrypto.assetParam.test.jsx
```
Expected: 2 PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```
npx vitest run
```
Expected: all previously-passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ReceiveCrypto.jsx src/pages/__tests__/ReceiveCrypto.assetParam.test.jsx
git commit -m "feat: ReceiveCrypto reads ?asset= param to pre-select asset"
```

---

## Checklist: spec coverage

| Spec requirement | Task |
|---|---|
| Tap crypto on dashboard → navigate to detail page | Task 4 (WalletPortfolioPage), Task 5 (TokenList) |
| Detail page: coin logo, name, symbol, price, 24h change | Task 2 |
| Detail page: user's balance strip | Task 2 |
| Detail page: 1H/4H/1D/1W/1M period tabs | Task 2 |
| Detail page: candlestick chart | Task 1 + Task 2 |
| Detail page: Send button → `/send?asset=X` | Task 2 |
| Detail page: Receive button → `/receive?asset=X` | Task 2 |
| Route `/asset/:symbol` registered | Task 3 |
| SendCrypto pre-selects from `?asset=` | Task 6 |
| ReceiveCrypto pre-selects from `?asset=` | Task 7 |
| Unknown symbol → "Asset not found" (no crash) | Task 2 |
| Balance read failure → `—` (I4 fail-honest) | Task 2 |
| Chart fetch failure → placeholder (no broken layout) | Task 1 |
| Explore mode (no vault) → balance strip hidden | Task 2 |
| `PriceCharts.jsx` still works (no duplication) | Task 1 |
