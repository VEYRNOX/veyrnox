# Analytics & Portfolio — Local-First Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 6 analytics/portfolio pages from `base44Client` to the local-first stack (`portfolioBalances`, `txHistory`, `priceFeed`), removing all synthetic/hardcoded data from critical paths.

**Architecture:** A shared `useAnalytics()` hook wraps `usePortfolio`, tx history fetching, and `useLivePrices` into one surface. A new `snapshotStore.js` replaces base44 CRUD for portfolio snapshots using localStorage keyed by wallet-address fingerprint (deniability: decoy session → different addresses → different key). Benchmark/Rewind pages gate on `pricesEnabled` rather than show fake data.

**Tech Stack:** React 18, TanStack React Query, `@tanstack/react-query`, Recharts, Vitest, `@/lib/portfolioBalances`, `@/lib/txHistory`, `@/lib/priceFeed`, `@/wallet-core/assets`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/snapshotStore.js` | localStorage snapshot CRUD (replaces base44 PortfolioSnapshot entity) |
| Create | `src/lib/__tests__/snapshotStore.test.js` | Unit tests for snapshotStore |
| Create | `src/hooks/useAnalytics.js` | Shared hook: portfolio + history + prices |
| Modify | `src/pages/Analytics.jsx` | Wire to useAnalytics; remove base44 |
| Modify | `src/pages/PortfolioSnapshots.jsx` | Wire to snapshotStore; remove base44 |
| Modify | `src/pages/AdvancedAnalytics.jsx` | Wire to useAnalytics; remove fake monthly chart |
| Modify | `src/pages/PortfolioRiskScore.jsx` | Wire to useAnalytics; drop loans/staking sub-scores |
| Modify | `src/pages/PortfolioBenchmark.jsx` | Gate on pricesEnabled; remove synthetic benchmark data |
| Modify | `src/pages/PortfolioRewind.jsx` | Gate on pricesEnabled; remove hardcoded PRICE_HISTORY |

---

## Task 1: Create `snapshotStore.js`

**Files:**
- Create: `src/lib/snapshotStore.js`
- Create: `src/lib/__tests__/snapshotStore.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/snapshotStore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { listSnapshots, saveSnapshot, deleteSnapshot } from '../snapshotStore.js';

const ADDRS = { w1: { evm: '0xABCD', btc: null, sol: null } };
const PORTFOLIO = {
  grandTotal: 1234.56,
  assetTotals: { ETH: { usd: 1000 }, USDC: { usd: 234.56 } },
  indeterminate: false,
};

beforeEach(() => localStorage.clear());

describe('listSnapshots', () => {
  it('returns [] when nothing saved', () => {
    expect(listSnapshots(ADDRS)).toEqual([]);
  });

  it('returns [] when walletAddresses is empty', () => {
    expect(listSnapshots({})).toEqual([]);
  });
});

describe('saveSnapshot', () => {
  it('saves a snapshot and it appears in listSnapshots', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'My snapshot', 'A note');
    const snaps = listSnapshots(ADDRS);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].label).toBe('My snapshot');
    expect(snaps[0].note).toBe('A note');
    expect(snaps[0].total_usd).toBe(1234.56);
    expect(snaps[0].breakdown).toEqual({ ETH: 1000, USDC: 234.56 });
    expect(snaps[0].indeterminate).toBe(false);
    expect(snaps[0].id).toBeTruthy();
    expect(snaps[0].created_date).toBeTruthy();
  });

  it('prepends new snapshots (newest first)', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'First', '');
    saveSnapshot(ADDRS, PORTFOLIO, 'Second', '');
    const snaps = listSnapshots(ADDRS);
    expect(snaps[0].label).toBe('Second');
    expect(snaps[1].label).toBe('First');
  });

  it('uses a default label when label is empty', () => {
    saveSnapshot(ADDRS, PORTFOLIO, '', '');
    const snaps = listSnapshots(ADDRS);
    expect(snaps[0].label).toBeTruthy();
    expect(typeof snaps[0].label).toBe('string');
  });

  it('returns null when walletAddresses is empty', () => {
    const result = saveSnapshot({}, PORTFOLIO, 'x', '');
    expect(result).toBeNull();
  });

  it('different address sets produce different keys', () => {
    const otherAddrs = { w2: { evm: '0xDEAD', btc: null, sol: null } };
    saveSnapshot(ADDRS, PORTFOLIO, 'real', '');
    saveSnapshot(otherAddrs, PORTFOLIO, 'decoy', '');
    expect(listSnapshots(ADDRS)[0].label).toBe('real');
    expect(listSnapshots(otherAddrs)[0].label).toBe('decoy');
  });
});

describe('deleteSnapshot', () => {
  it('removes a snapshot by id', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'Keep', '');
    saveSnapshot(ADDRS, PORTFOLIO, 'Delete me', '');
    const snaps = listSnapshots(ADDRS);
    deleteSnapshot(ADDRS, snaps[0].id); // newest = 'Delete me'
    const remaining = listSnapshots(ADDRS);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('Keep');
  });

  it('is a no-op for unknown id', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'Keep', '');
    deleteSnapshot(ADDRS, 'nonexistent-id');
    expect(listSnapshots(ADDRS)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```
npx vitest run src/lib/__tests__/snapshotStore.test.js
```

Expected: `Cannot find module '../snapshotStore.js'`

- [ ] **Step 3: Create `src/lib/snapshotStore.js`**

```js
// lib/snapshotStore.js — localStorage-backed portfolio snapshots.
//
// Keyed by a deterministic fingerprint of the active wallet set's addresses.
// A decoy session derives different addresses → different fingerprint → sees only
// decoy snapshots (I3 deniability). No active clearing on lock required: the
// key isolation is sufficient — a relocked vault's addresses are unavailable,
// and a re-unlocked decoy has different addresses → different key.

/** @param {Record<string, {evm?:string|null, btc?:string|null, sol?:string|null}>} walletAddresses */
function walletSetFingerprint(walletAddresses) {
  return Object.values(walletAddresses)
    .map((a) => a?.evm || a?.btc || a?.sol || '')
    .filter(Boolean)
    .sort()
    .join(',');
}

const storeKey = (fp) => `veyrnox-snapshots-${fp}`;

/**
 * @param {Record<string, {evm?:string|null, btc?:string|null, sol?:string|null}>} walletAddresses
 * @returns {Array<{id:string, created_date:string, label:string, note:string, total_usd:number, breakdown:Record<string,number>, indeterminate:boolean}>}
 */
export function listSnapshots(walletAddresses) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return [];
    const raw = localStorage.getItem(storeKey(fp));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * @param {Record<string, {evm?:string|null, btc?:string|null, sol?:string|null}>} walletAddresses
 * @param {{grandTotal?:number, assetTotals?:Record<string,{usd?:number|null}>, indeterminate?:boolean}|null} portfolio
 * @param {string} label
 * @param {string} note
 * @returns {{id:string, created_date:string, label:string, note:string, total_usd:number, breakdown:Record<string,number>, indeterminate:boolean}|null}
 */
export function saveSnapshot(walletAddresses, portfolio, label, note) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return null;
    const existing = listSnapshots(walletAddresses);
    const now = new Date();
    const defaultLabel =
      now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const snap = {
      id: `snap-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
      created_date: now.toISOString(),
      label: label || defaultLabel,
      note: note || '',
      total_usd: portfolio?.grandTotal ?? 0,
      breakdown: Object.fromEntries(
        Object.entries(portfolio?.assetTotals ?? {}).map(([sym, v]) => [sym, v.usd ?? 0])
      ),
      indeterminate: !!portfolio?.indeterminate,
    };
    localStorage.setItem(storeKey(fp), JSON.stringify([snap, ...existing]));
    return snap;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, {evm?:string|null, btc?:string|null, sol?:string|null}>} walletAddresses
 * @param {string} id
 */
export function deleteSnapshot(walletAddresses, id) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return;
    const updated = listSnapshots(walletAddresses).filter((s) => s.id !== id);
    localStorage.setItem(storeKey(fp), JSON.stringify(updated));
  } catch { /* best-effort */ }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run src/lib/__tests__/snapshotStore.test.js
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```
git add src/lib/snapshotStore.js src/lib/__tests__/snapshotStore.test.js
git commit -m "feat(analytics): snapshotStore — local localStorage snapshot CRUD"
```

---

## Task 2: Create `useAnalytics` hook

**Files:**
- Create: `src/hooks/useAnalytics.js`

- [ ] **Step 1: Create `src/hooks/useAnalytics.js`**

```js
// hooks/useAnalytics.js — shared data hook for analytics & portfolio pages.
//
// Wraps usePortfolio (balances), fetchAssetHistory (tx history for all active
// assets), and useLivePrices (opt-in prices) into one surface. No new data
// egress — all three sources were already established.

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/lib/WalletProvider';
import { usePortfolio } from '@/lib/portfolioBalances';
import { useLivePrices, isLivePricesEnabled } from '@/lib/priceFeed';
import { fetchAssetHistory } from '@/lib/txHistory';
import { getAsset } from '@/wallet-core/assets';

/**
 * @returns {{
 *   portfolio: object | null,
 *   history: Array<object>,
 *   prices: Record<string,number> | null,
 *   pricesEnabled: boolean,
 *   loading: boolean,
 *   error: Error | null,
 * }}
 */
export function useAnalytics() {
  const { isUnlocked, wallets = [], walletAddresses = {} } = useWallet();

  const { data: portfolio = null, isLoading: portfolioLoading } = usePortfolio(
    isUnlocked ? wallets : [],
    walletAddresses,
  );

  const { prices, isLoading: pricesLoading } = useLivePrices();
  const pricesEnabled = isLivePricesEnabled();

  // Stable query keys derived from wallet set + address set
  const walletKey = wallets
    .map((w) => `${w.id}:${(w.enabledAssets || []).sort().join(',')}`)
    .join('|');
  const addrKey = Object.entries(walletAddresses)
    .map(([id, a]) => `${id}:${a?.evm || ''}:${a?.btc || ''}:${a?.sol || ''}`)
    .sort()
    .join('|');

  const historyQuery = useQuery({
    queryKey: ['analytics-history', walletKey, addrKey],
    queryFn: async () => {
      const allTxs = [];
      for (const wallet of wallets) {
        const addrs = walletAddresses[wallet.id] || {};
        for (const symbol of wallet.enabledAssets || []) {
          const asset = getAsset(symbol);
          if (!asset) continue;
          const address =
            asset.family === 'btc' ? addrs.btc :
            asset.family === 'solana' ? addrs.sol :
            addrs.evm;
          if (!address) continue;
          const result = await fetchAssetHistory({ asset, address });
          if (Array.isArray(result.transactions)) {
            allTxs.push(...result.transactions);
          }
        }
      }
      return allTxs;
    },
    enabled: isUnlocked && wallets.length > 0,
    staleTime: 60_000,
  });

  return {
    portfolio: isUnlocked ? (portfolio ?? null) : null,
    history: historyQuery.data ?? [],
    prices: pricesEnabled ? (prices ?? null) : null,
    pricesEnabled,
    loading: portfolioLoading || (historyQuery.isLoading && isUnlocked),
    error: /** @type {Error | null} */ (historyQuery.error ?? null),
  };
}
```

- [ ] **Step 2: Verify the file type-checks cleanly**

```
npx tsc --project jsconfig.json --noEmit 2>&1 | grep useAnalytics
```

Expected: no output (no errors for this file).

- [ ] **Step 3: Commit**

```
git add src/hooks/useAnalytics.js
git commit -m "feat(analytics): useAnalytics hook — portfolio + history + prices"
```

---

## Task 3: Migrate `Analytics.jsx`

**Files:**
- Modify: `src/pages/Analytics.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { USD_RATES, CURRENCY_COLORS } from "@/lib/cryptos";
import { useState, useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "@/lib/recharts";
import { TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2 } from "lucide-react";

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

const fmt = (n) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtSmall = (n) => "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const CustomTooltip = (/** @type {any} */ { active, payload, label } = {}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

const PieTooltip = (/** @type {any} */ { active, payload } = {}) => {
  if (!active || !payload?.length) return null;
  const { name, value, percent } = payload[0];
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">{fmt(value)} &middot; {(percent * 100).toFixed(1)}%</p>
    </div>
  );
};

const LiveGate = () => (
  <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
    <p className="text-sm text-muted-foreground">
      Enable <strong>Live Prices</strong> in Settings to see this chart in USD.
    </p>
  </div>
);

export default function Analytics() {
  const [range, setRange] = useState(30);
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();

  // Allocation from real on-chain balances
  const allocationData = useMemo(() => {
    if (!portfolio?.assetTotals) return [];
    return Object.entries(portfolio.assetTotals)
      .map(([name, v]) => ({ name, value: Math.round(v.usd ?? 0) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [portfolio]);

  const totalUSD = portfolio?.grandTotal ?? 0;
  const bestAsset = allocationData[0];

  // Portfolio growth chart — reconstructed from tx history at current prices.
  // This is a current-price approximation, not true historical prices.
  const monthlyData = useMemo(() => {
    if (!pricesEnabled || !prices) return [];
    const nowMs = Date.now();
    const cutoffMs = nowMs - range * 86400_000;
    // Bucket keys
    const buckets = /** @type {Record<string, number>} */ ({});
    for (let i = range; i >= 0; i--) {
      const d = new Date(nowMs - i * 86400_000);
      const key = d.toLocaleDateString("en-GB", range <= 30
        ? { day: "numeric", month: "short" }
        : { month: "short", year: "2-digit" });
      if (!(key in buckets)) buckets[key] = totalUSD;
    }
    // Walk backwards from current total
    let running = totalUSD;
    const sorted = [...history]
      .filter((t) => t.timestamp != null)
      .sort((a, b) => b.timestamp - a.timestamp);
    for (const tx of sorted) {
      if (tx.timestamp < cutoffMs - 30 * 86400_000) break;
      const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || "0") * rate;
      if (tx.type === "send") running += usd;
      else if (tx.type === "receive") running -= usd;
      const key = new Date(tx.timestamp).toLocaleDateString("en-GB", range <= 30
        ? { day: "numeric", month: "short" }
        : { month: "short", year: "2-digit" });
      if (key in buckets) buckets[key] = Math.max(0, Math.round(running));
    }
    return Object.entries(buckets)
      .filter((_, idx) => range > 30 ? idx % 7 === 0 : true)
      .map(([date, value]) => ({ date, value }));
  }, [history, pricesEnabled, prices, range, totalUSD]);

  // Monthly PnL — receives vs sends in USD at current prices
  const pnlData = useMemo(() => {
    const months = /** @type {Record<string, {month:string, gains:number, losses:number}>} */ ({});
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString("en-GB", { month: "short" });
      if (!months[key]) months[key] = { month: key, gains: 0, losses: 0 };
    }
    if (pricesEnabled && prices) {
      for (const tx of history) {
        if (!tx.timestamp) continue;
        const key = new Date(tx.timestamp).toLocaleString("en-GB", { month: "short" });
        if (!months[key]) continue;
        const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
        const usd = parseFloat(tx.amount || "0") * rate;
        if (tx.type === "receive") months[key].gains += usd;
        if (tx.type === "send") months[key].losses += usd;
      }
    }
    return Object.values(months).map((m) => ({
      ...m,
      gains: Math.round(m.gains),
      losses: Math.round(m.losses),
    }));
  }, [history, pricesEnabled, prices]);

  const totalGains = pnlData.reduce((s, m) => s + m.gains, 0);
  const totalLosses = pnlData.reduce((s, m) => s + m.losses, 0);
  const netPnL = totalGains - totalLosses;

  if (!isUnlocked) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio performance &amp; insights</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Total Value</span>
          </div>
          <p className="text-base font-bold">{pricesEnabled ? fmt(totalUSD) : "—"}</p>
        </div>
        <div className={`rounded-xl border bg-card p-3 space-y-1 ${pricesEnabled && netPnL >= 0 ? "border-green-500/30" : "border-border"}`}>
          <div className="flex items-center gap-1 text-muted-foreground">
            {pricesEnabled && netPnL >= 0
              ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              : <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-[10px] uppercase tracking-wide">Net PnL</span>
          </div>
          {pricesEnabled
            ? <p className={`text-base font-bold ${netPnL >= 0 ? "text-green-400" : "text-destructive"}`}>
                {netPnL >= 0 ? "+" : "-"}{fmtSmall(netPnL)}
              </p>
            : <p className="text-xs text-muted-foreground">Requires live prices</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Top Asset</span>
          </div>
          <p className="text-base font-bold">{bestAsset?.name ?? "—"}</p>
        </div>
      </div>

      {/* Portfolio Growth Chart */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Portfolio Value</p>
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setRange(r.days)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${range === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {!pricesEnabled ? <LiveGate /> : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(28,95%,54%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(28,95%,54%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,5%,20%)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" name="Portfolio" stroke="hsl(28,95%,54%)" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {pricesEnabled && (
          <p className="text-[10px] text-muted-foreground">Values use current prices — not historical rates.</p>
        )}
      </div>

      {/* Asset Allocation */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Asset Allocation</p>
        </div>
        {allocationData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No wallet data yet</p>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={allocationData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {allocationData.map((entry) => (
                    <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#888"} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {allocationData.map((d) => {
                const pct = totalUSD > 0 ? ((d.value / totalUSD) * 100).toFixed(1) : "0";
                return (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: CURRENCY_COLORS[d.name] || "#888" }} />
                      <span className="text-xs font-semibold">{d.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono">{pricesEnabled ? fmt(d.value) : "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Monthly PnL */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Monthly Activity (6 months)</p>
        </div>
        {!pricesEnabled ? <LiveGate /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pnlData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,5%,20%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
              <Bar dataKey="gains" name="Received" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="losses" name="Sent" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44 import remains**

```
grep -n "base44" src/pages/Analytics.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/Analytics.jsx
git commit -m "feat(analytics): migrate Analytics page to local-first stack"
```

---

## Task 4: Migrate `PortfolioSnapshots.jsx`

**Files:**
- Modify: `src/pages/PortfolioSnapshots.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { useState, useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { listSnapshots, saveSnapshot, deleteSnapshot } from "@/lib/snapshotStore";
import { Camera, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "@/lib/recharts";
import { toast } from "sonner";

export default function PortfolioSnapshots() {
  const { isUnlocked, walletAddresses } = useWallet();
  const { portfolio } = useAnalytics();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  // Re-render trigger after mutations (snapshots live in localStorage, not react-query)
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  const snapshots = useMemo(() => listSnapshots(walletAddresses), [walletAddresses, /* tick dep satisfied by bump */ showSave]);

  const currentTotalUSD = portfolio?.grandTotal ?? 0;

  function handleSave() {
    const result = saveSnapshot(walletAddresses, portfolio, label, note);
    if (result) {
      toast.success("Snapshot saved");
    } else {
      toast.error("Could not save snapshot — wallet not unlocked");
    }
    setShowSave(false);
    setLabel("");
    setNote("");
    bump();
  }

  function handleDelete(id) {
    deleteSnapshot(walletAddresses, id);
    bump();
  }

  const chartData = [...snapshots].reverse().map((s) => ({
    date: new Date(s.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: s.total_usd,
    label: s.label,
  }));

  const latest = snapshots[0];
  const previous = snapshots[1];
  const change = latest && previous ? latest.total_usd - previous.total_usd : null;
  const changePct = change != null && previous ? (change / previous.total_usd) * 100 : null;

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Snapshots</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to manage snapshots.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Save and compare historical portfolio values</p>
        </div>
        <Button onClick={() => setShowSave(true)}>
          <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
        </Button>
      </div>

      {/* Current vs Last */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Current Value</p>
          <p className="text-xl font-bold">${currentTotalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Since Last Snapshot</p>
          {change != null ? (
            <div className={`flex items-center gap-1 text-lg font-bold ${change >= 0 ? "text-green-400" : "text-destructive"}`}>
              {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {change >= 0 ? "+" : ""}${Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-sm">({changePct?.toFixed(1)}%)</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Value Over Time</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, "Portfolio"]} labelFormatter={(l) => l} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Snapshot List */}
      {snapshots.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No snapshots yet — save one now</p>
        </div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((s, i) => {
            const prev = snapshots[i + 1];
            const diff = prev ? s.total_usd - prev.total_usd : null;
            return (
              <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{s.label}</p>
                    {i === 0 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Latest</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.created_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">${s.total_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  {diff != null && (
                    <p className={`text-xs ${diff >= 0 ? "text-green-400" : "text-destructive"}`}>
                      {diff >= 0 ? "+" : ""}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => handleDelete(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showSave} onOpenChange={setShowSave}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save Portfolio Snapshot</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">Current value to snapshot</p>
              <p className="text-xl font-bold">${currentTotalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. End of Q2 2025" className="mt-1.5" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any notes..." className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={handleSave}>
              <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44 import**

```
grep -n "base44\|useQuery\|useMutation\|moment" src/pages/PortfolioSnapshots.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/PortfolioSnapshots.jsx
git commit -m "feat(analytics): migrate PortfolioSnapshots to snapshotStore"
```

---

## Task 5: Migrate `AdvancedAnalytics.jsx`

**Files:**
- Modify: `src/pages/AdvancedAnalytics.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { USD_RATES } from "@/lib/cryptos";
import { useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { TrendingUp, Activity, Target, AlertTriangle, BarChart3, Shield } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "@/lib/recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Reference tables — not fetched data. 5-asset coverage is honest for testnet scope.
const VOLATILITY = { BTC: 0.72, ETH: 0.85, SOL: 1.2, USDC: 0.01, USDT: 0.01 };
const SHARPE = { BTC: 1.4, ETH: 1.1, SOL: 0.9, USDC: 0.05, USDT: 0.05 };
const CORRELATION = [
  { asset: "BTC", BTC: 1, ETH: 0.72, SOL: 0.61, USDC: -0.05, USDT: -0.04 },
  { asset: "ETH", BTC: 0.72, ETH: 1, SOL: 0.78, USDC: -0.03, USDT: -0.02 },
  { asset: "SOL", BTC: 0.61, ETH: 0.78, SOL: 1, USDC: -0.01, USDT: -0.01 },
  { asset: "USDC", BTC: -0.05, ETH: -0.03, SOL: -0.01, USDC: 1, USDT: 0.99 },
  { asset: "USDT", BTC: -0.04, ETH: -0.02, SOL: -0.01, USDC: 0.99, USDT: 1 },
];
const CORRELATION_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT"];
const DEFAULT_VOLATILITY = 0.5;
const DEFAULT_SHARPE = 0.5;

export default function AdvancedAnalytics() {
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();

  const assetTotals = portfolio?.assetTotals ?? {};
  const totalUSD = portfolio?.grandTotal ?? 0;
  const assets = Object.keys(assetTotals).filter((c) => (assetTotals[c]?.usd ?? 0) > 0);

  const portfolioVolatility = useMemo(() => {
    if (totalUSD === 0) return 0;
    return assets.reduce((s, c) => s + ((assetTotals[c].usd ?? 0) / totalUSD) * (VOLATILITY[c] ?? DEFAULT_VOLATILITY), 0);
  }, [assets, assetTotals, totalUSD]);

  const portfolioSharpe = useMemo(() => {
    if (totalUSD === 0) return 0;
    return assets.reduce((s, c) => s + ((assetTotals[c].usd ?? 0) / totalUSD) * (SHARPE[c] ?? DEFAULT_SHARPE), 0);
  }, [assets, assetTotals, totalUSD]);

  const diversificationScore = useMemo(() => {
    if (assets.length === 0) return 0;
    const weights = assets.map((c) => (assetTotals[c].usd ?? 0) / totalUSD);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    return Math.round((1 - hhi) * 100);
  }, [assets, assetTotals, totalUSD]);

  const stableRatio = useMemo(() => {
    const stables = ["USDC", "USDT"];
    const stableUSD = stables.reduce((s, c) => s + (assetTotals[c]?.usd ?? 0), 0);
    return totalUSD > 0 ? ((stableUSD / totalUSD) * 100).toFixed(1) : "0";
  }, [assetTotals, totalUSD]);

  // Monthly outflow/inflow from real tx history — gated on pricesEnabled for USD display
  const monthlyPerformance = useMemo(() => {
    const months = /** @type {Record<string, {month:string, inflow:number, outflow:number}>} */ ({});
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString("en-GB", { month: "short" });
      if (!months[key]) months[key] = { month: key, inflow: 0, outflow: 0 };
    }
    if (pricesEnabled && prices) {
      for (const tx of history) {
        if (!tx.timestamp) continue;
        const key = new Date(tx.timestamp).toLocaleString("en-GB", { month: "short" });
        if (!months[key]) continue;
        const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
        const usd = parseFloat(tx.amount || "0") * rate;
        if (tx.type === "receive") months[key].inflow += usd;
        if (tx.type === "send") months[key].outflow += usd;
      }
    }
    return Object.values(months).map((m) => ({ ...m, inflow: Math.round(m.inflow), outflow: Math.round(m.outflow) }));
  }, [history, pricesEnabled, prices]);

  const bestMonth = pricesEnabled ? Math.max(...monthlyPerformance.map((m) => m.inflow - m.outflow)) : null;
  const worstMonth = pricesEnabled ? Math.min(...monthlyPerformance.map((m) => m.inflow - m.outflow)) : null;
  const winMonths = pricesEnabled ? monthlyPerformance.filter((m) => m.inflow > m.outflow).length : null;

  const radarData = assets.slice(0, 5).map((c) => ({
    asset: c,
    allocation: totalUSD > 0 ? Math.round(((assetTotals[c].usd ?? 0) / totalUSD) * 100) : 0,
    volatility: Math.round((VOLATILITY[c] ?? DEFAULT_VOLATILITY) * 100),
    sharpe: Math.round((SHARPE[c] ?? DEFAULT_SHARPE) * 100),
  }));

  const riskLevel = portfolioVolatility < 0.3
    ? { label: "Low", color: "text-green-400", bg: "bg-green-500/10" }
    : portfolioVolatility < 0.6
    ? { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10" }
    : { label: "High", color: "text-destructive", bg: "bg-destructive/10" };

  const metrics = [
    { label: "Portfolio Risk", value: riskLevel.label, color: riskLevel.color, bg: riskLevel.bg, icon: Shield },
    { label: "Sharpe Ratio", value: portfolioSharpe.toFixed(2), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Diversification", value: `${diversificationScore}%`, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Stable Ratio", value: `${stableRatio}%`, icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
  ];

  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Advanced Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">In-depth risk analysis and performance metrics</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className={`p-3 rounded-xl border border-border ${m.bg} text-center`}>
            <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="performance" className="flex-1">Performance</TabsTrigger>
          <TabsTrigger value="risk" className="flex-1">Risk</TabsTrigger>
          <TabsTrigger value="correlation" className="flex-1">Correlation</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-1">Monthly Activity</p>
            {!pricesEnabled && (
              <p className="text-xs text-muted-foreground mb-3">Enable live prices in Settings to see USD values.</p>
            )}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} contentStyle={chartStyle} />
                <Legend />
                <Bar dataKey="inflow" name="Received" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Sent" fill="#F7931A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Best Month", value: bestMonth != null ? (bestMonth >= 0 ? "+" : "") + "$" + Math.abs(bestMonth).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—", color: "text-green-400" },
              { label: "Worst Month", value: worstMonth != null ? (worstMonth >= 0 ? "+" : "-") + "$" + Math.abs(worstMonth).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—", color: "text-destructive" },
              { label: "Win Rate", value: winMonths != null ? `${Math.round((winMonths / 6) * 100)}%` : "—", color: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Risk / Return Profile</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="asset" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Allocation" dataKey="allocation" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                <Radar name="Volatility" dataKey="volatility" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} />
                <Tooltip contentStyle={chartStyle} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {assets.map((c) => (
              <div key={c} className="px-4 py-3 flex items-center gap-3">
                <div className="w-16 text-sm font-semibold">{c}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-14">Volatility</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min((VOLATILITY[c] ?? DEFAULT_VOLATILITY) * 100, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8">{((VOLATILITY[c] ?? DEFAULT_VOLATILITY) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-14">Sharpe</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min((SHARPE[c] ?? DEFAULT_SHARPE) * 70, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8">{SHARPE[c] ?? DEFAULT_SHARPE}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {portfolioVolatility > 0.5 && (
            <div className="flex gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">High portfolio volatility detected. Consider increasing stablecoin allocation to reduce risk.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="correlation" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-1">Asset Correlation Matrix</p>
            <p className="text-xs text-muted-foreground mb-3">How these assets move together (1 = perfect correlation). Reference data for 5 assets.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-3 text-muted-foreground font-normal"></th>
                    {CORRELATION_ASSETS.map((a) => <th key={a} className="py-1 px-2 text-muted-foreground font-normal">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CORRELATION.map((row) => (
                    <tr key={row.asset}>
                      <td className="py-1 pr-3 font-semibold">{row.asset}</td>
                      {CORRELATION_ASSETS.map((col) => {
                        const val = row[col];
                        if (val == null) return <td key={col} className="py-1 px-2 text-center font-mono text-muted-foreground">—</td>;
                        const isHigh = val > 0.6 && val < 1;
                        const isLow = val < 0.1;
                        return (
                          <td key={col} className={`py-1 px-2 text-center rounded font-mono ${val === 1 ? "bg-secondary" : isHigh ? "text-yellow-400" : isLow ? "text-blue-400" : ""}`}>
                            {val.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3 items-start p-3 rounded-xl border border-border bg-card text-xs text-muted-foreground">
            <Activity className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>Assets with low correlation (blue) improve diversification. Highly correlated assets (yellow) provide less risk reduction benefit when combined.</span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44 or MONTHLY_PERFORMANCE hardcoded data**

```
grep -n "base44\|MONTHLY_PERFORMANCE\|genBenchmark" src/pages/AdvancedAnalytics.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/AdvancedAnalytics.jsx
git commit -m "feat(analytics): migrate AdvancedAnalytics — real monthly activity, remove fake data"
```

---

## Task 6: Migrate `PortfolioRiskScore.jsx`

**Files:**
- Modify: `src/pages/PortfolioRiskScore.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { Zap } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

// Reference volatility table. Assets not listed fall back to 0.5.
const VOLATILITY = { BTC: 0.65, ETH: 0.75, SOL: 0.85, USDC: 0.01, USDT: 0.01 };

function getRiskLabel(score) {
  if (score <= 3) return { label: "Low Risk", color: "text-green-500", bg: "bg-green-500" };
  if (score <= 6) return { label: "Medium Risk", color: "text-yellow-500", bg: "bg-yellow-500" };
  if (score <= 8) return { label: "High Risk", color: "text-orange-500", bg: "bg-orange-500" };
  return { label: "Very High Risk", color: "text-destructive", bg: "bg-destructive" };
}

export default function PortfolioRiskScore() {
  const { isUnlocked } = useWallet();
  const { portfolio } = useAnalytics();

  const assetTotals = portfolio?.assetTotals ?? {};
  const totalUSD = portfolio?.grandTotal ?? 0;

  // Concentration risk (Herfindahl-Hirschman index on USD weights)
  const shares = Object.values(assetTotals).map((v) => totalUSD > 0 ? (v.usd ?? 0) / totalUSD : 0);
  const hhi = shares.reduce((s, p) => s + p * p, 0);
  const concentrationScore = Math.min(10, hhi * 10);

  // Volatility risk (weighted avg of reference volatility values)
  const weightedVol = Object.entries(assetTotals).reduce(
    (s, [sym, v]) => s + ((v.usd ?? 0) / (totalUSD || 1)) * (VOLATILITY[sym] ?? 0.5),
    0
  );
  const volatilityScore = Math.min(10, weightedVol * 10);

  // Diversification score (inverse — penalises <3 assets)
  const numAssets = Object.keys(assetTotals).filter((c) => (assetTotals[c].usd ?? 0) > 0).length;
  const diversificationScore = Math.max(0, 10 - numAssets * 2);

  const overallScore = parseFloat(
    ((concentrationScore + volatilityScore + diversificationScore) / 3).toFixed(1)
  );
  const risk = getRiskLabel(overallScore);

  const radarData = [
    { subject: "Concentration", score: concentrationScore },
    { subject: "Volatility", score: volatilityScore },
    { subject: "Diversification", score: diversificationScore },
  ];

  const recs = [];
  if (concentrationScore > 6) recs.push("Diversify — a single asset dominates your portfolio.");
  if (volatilityScore > 7) recs.push("Consider adding stablecoins to reduce volatility exposure.");
  if (diversificationScore > 5) recs.push("Hold more than 3 different assets to spread risk.");
  if (recs.length === 0) recs.push("Your portfolio risk profile looks healthy. Keep it up!");

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-xl font-bold">Portfolio Risk Score</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see your risk score.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Risk Score</h1>
        <p className="text-sm text-muted-foreground">Risk assessment based on your on-chain holdings</p>
      </div>

      {/* Score card */}
      <div className="p-6 rounded-xl border border-border bg-card text-center">
        <p className="text-xs text-muted-foreground mb-2">Overall Risk Score</p>
        <p className={`text-6xl font-black ${risk.color}`}>{overallScore}</p>
        <p className="text-sm text-muted-foreground mt-1">out of 10</p>
        <div className="w-full bg-secondary rounded-full h-3 mt-4">
          <div className={`h-3 rounded-full transition-all ${risk.bg}`} style={{ width: `${overallScore * 10}%` }} />
        </div>
        <p className={`mt-3 font-semibold ${risk.color}`}>{risk.label}</p>
      </div>

      {/* Radar */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-4">Risk Breakdown</p>
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Radar dataKey="score" stroke="#f97316" fill="#f97316" fillOpacity={0.25} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Factor cards */}
      <div className="grid grid-cols-3 gap-3">
        {radarData.map((d) => {
          const r = getRiskLabel(d.score);
          return (
            <div key={d.subject} className="p-3 rounded-xl border border-border bg-card">
              <p className="text-xs text-muted-foreground">{d.subject}</p>
              <p className={`text-xl font-bold mt-0.5 ${r.color}`}>{d.score.toFixed(1)}</p>
              <p className={`text-[10px] font-medium mt-0.5 ${r.color}`}>{r.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Recommendations
        </p>
        {recs.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary mt-0.5">→</span><span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44, staking, or loans queries**

```
grep -n "base44\|StakingPosition\|CryptoLoan" src/pages/PortfolioRiskScore.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/PortfolioRiskScore.jsx
git commit -m "feat(analytics): migrate PortfolioRiskScore — 3-factor local risk scoring"
```

---

## Task 7: Migrate `PortfolioBenchmark.jsx`

**Files:**
- Modify: `src/pages/PortfolioBenchmark.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { USD_RATES } from "@/lib/cryptos";
import { useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { TrendingUp, TrendingDown, BarChart2, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "@/lib/recharts";

const LivePricesGate = ({ title }) => (
  <div className="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
    <div className="p-8 rounded-xl border border-border bg-card text-center space-y-3">
      <Lock className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
      <p className="text-sm font-medium">Live Prices Required</p>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
        This feature uses current prices to calculate portfolio returns.
        Go to <strong>Settings → Live Prices</strong> to enable it.
      </p>
    </div>
  </div>
);

export default function PortfolioBenchmark() {
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-xl font-bold">Portfolio Benchmarking</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to continue.</p>
      </div>
    );
  }

  if (!pricesEnabled) return <LivePricesGate title="Portfolio Benchmarking" />;

  const totalUSD = portfolio?.grandTotal ?? 0;

  // Compute 30-day portfolio return from tx history at current prices.
  // This is current-price approximation, not true historical performance.
  const portfolioReturn30d = useMemo(() => {
    const cutoffMs = Date.now() - 30 * 86400_000;
    let past = totalUSD;
    const sorted = [...history]
      .filter((t) => t.timestamp != null && t.timestamp >= cutoffMs)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const tx of sorted) {
      const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || "0") * rate;
      if (tx.type === "send") past += usd;
      else if (tx.type === "receive") past -= usd;
    }
    return past > 0 ? (((totalUSD - past) / past) * 100).toFixed(2) : "0.00";
  }, [history, prices, totalUSD]);

  // Build a 30-day portfolio value series for the chart
  const chartData = useMemo(() => {
    const nowMs = Date.now();
    const points = Array.from({ length: 31 }, (_, i) => {
      const tsMs = nowMs - (30 - i) * 86400_000;
      const d = new Date(tsMs);
      return {
        day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        tsMs,
        Portfolio: totalUSD,
      };
    });
    // Walk history backwards to fill Portfolio series
    let running = totalUSD;
    const sorted = [...history]
      .filter((t) => t.timestamp != null)
      .sort((a, b) => b.timestamp - a.timestamp);
    for (let i = points.length - 1; i >= 0; i--) {
      for (const tx of sorted.filter((t) => t.timestamp <= points[i].tsMs && (i === 0 || t.timestamp > points[i - 1].tsMs))) {
        const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
        const usd = parseFloat(tx.amount || "0") * rate;
        if (tx.type === "send") running += usd;
        else if (tx.type === "receive") running -= usd;
      }
      points[i].Portfolio = Math.max(0, Math.round(running));
    }
    return points;
  }, [history, prices, totalUSD]);

  const pfUp = parseFloat(portfolioReturn30d) >= 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Benchmarking</h1>
        <p className="text-sm text-muted-foreground">30-day portfolio performance at current prices</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Your Portfolio (30D)</p>
          <div className="flex items-center gap-2">
            {pfUp ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            <p className={`text-xl font-bold ${pfUp ? "text-green-500" : "text-destructive"}`}>
              {pfUp ? "+" : ""}{portfolioReturn30d}%
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">30-day return (current prices)</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Portfolio Value</p>
          <p className="text-xl font-bold">${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Current holdings</p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3">
          <BarChart2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Benchmark comparison not available</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historical BTC, ETH, and S&amp;P 500 data requires a market data feed not available in local-only mode.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-4">Portfolio Value (30D, current prices)</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={7} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Portfolio"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="Portfolio" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Reconstructed from transaction history at current prices — not true historical performance.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44, genBenchmark, or hardcoded synthetic data**

```
grep -n "base44\|genBenchmark\|BTC_DATA\|ETH_DATA\|SP500" src/pages/PortfolioBenchmark.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/PortfolioBenchmark.jsx
git commit -m "feat(analytics): migrate PortfolioBenchmark — gate on pricesEnabled, remove synthetic data"
```

---

## Task 8: Migrate `PortfolioRewind.jsx`

**Files:**
- Modify: `src/pages/PortfolioRewind.jsx`

- [ ] **Step 1: Replace the file contents**

```jsx
import { USD_RATES } from "@/lib/cryptos";
import { useState, useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { TrendingUp, TrendingDown, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "@/lib/recharts";

const PERIODS = [
  { label: "30 Days Ago", key: "30d", days: 30 },
  { label: "90 Days Ago", key: "90d", days: 90 },
  { label: "6 Months Ago", key: "180d", days: 180 },
  { label: "1 Year Ago", key: "1y", days: 365 },
];

const LivePricesGate = () => (
  <div className="max-w-2xl mx-auto space-y-6">
    <div>
      <h1 className="text-xl font-bold">Portfolio Rewind</h1>
    </div>
    <div className="p-8 rounded-xl border border-border bg-card text-center space-y-3">
      <Lock className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
      <p className="text-sm font-medium">Live Prices Required</p>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
        Rewind reconstructs past portfolio values from your transaction history using current prices.
        Go to <strong>Settings → Live Prices</strong> to enable it.
      </p>
    </div>
  </div>
);

export default function PortfolioRewind() {
  const [selectedPeriod, setSelectedPeriod] = useState("90d");
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();

  const period = PERIODS.find((p) => p.key === selectedPeriod) ?? PERIODS[1];
  const totalUSD = portfolio?.grandTotal ?? 0;
  const assetTotals = portfolio?.assetTotals ?? {};

  // Reconstruct past portfolio value by walking tx history backwards
  const pastTotal = useMemo(() => {
    if (!pricesEnabled || !prices) return 0;
    const cutoffMs = Date.now() - period.days * 86400_000;
    let val = totalUSD;
    const sorted = [...history]
      .filter((t) => t.timestamp != null && t.timestamp >= cutoffMs)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const tx of sorted) {
      const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || "0") * rate;
      if (tx.type === "send") val += usd;
      else if (tx.type === "receive") val -= usd;
    }
    return Math.max(0, val);
  }, [history, prices, pricesEnabled, period, totalUSD]);

  const gain = totalUSD - pastTotal;
  const gainPct = pastTotal > 0 ? (gain / pastTotal) * 100 : 0;

  // Build interpolated chart data from past to present
  const chartData = useMemo(() => {
    if (!pricesEnabled || !prices) return [];
    return Array.from({ length: 13 }, (_, i) => {
      const frac = i / 12;
      const val = pastTotal + (totalUSD - pastTotal) * frac;
      const tsMs = Date.now() - period.days * 86400_000 * (1 - frac);
      const d = new Date(tsMs);
      return {
        date: d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
        value: parseFloat(Math.max(0, val).toFixed(2)),
      };
    });
  }, [pastTotal, totalUSD, period, pricesEnabled, prices]);

  // Per-asset breakdown
  const assetBreakdown = useMemo(() => {
    if (!pricesEnabled || !prices) return [];
    return Object.entries(assetTotals)
      .filter(([, v]) => (v.usd ?? 0) > 0)
      .map(([symbol, v]) => {
        const currentVal = v.usd ?? 0;
        // Approximate past value: walk sends/receives for this asset in the period
        let pastVal = currentVal;
        const cutoffMs = Date.now() - period.days * 86400_000;
        const rate = (prices[symbol] ?? USD_RATES[symbol]) || 0;
        for (const tx of history.filter((t) => t.assetSymbol === symbol && t.timestamp != null && t.timestamp >= cutoffMs)) {
          const usd = parseFloat(tx.amount || "0") * rate;
          if (tx.type === "send") pastVal += usd;
          else if (tx.type === "receive") pastVal -= usd;
        }
        pastVal = Math.max(0, pastVal);
        const change = currentVal - pastVal;
        const changePct = pastVal > 0 ? (change / pastVal) * 100 : 0;
        return { symbol, currentVal, pastVal, change, changePct };
      });
  }, [assetTotals, history, prices, pricesEnabled, period]);

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-xl font-bold">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to continue.</p>
      </div>
    );
  }

  if (!pricesEnabled) return <LivePricesGate />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Approximate past values reconstructed from transaction history at current prices</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setSelectedPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedPeriod === p.key ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="p-5 rounded-xl border border-border bg-card text-center space-y-1">
        <p className="text-xs text-muted-foreground">{period.label} your portfolio was approximately worth</p>
        <p className="text-3xl font-bold">${pastTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">Now: ${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <span className={`flex items-center gap-0.5 text-sm font-semibold ${gain >= 0 ? "text-green-500" : "text-destructive"}`}>
            {gain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs font-semibold text-muted-foreground mb-3">Portfolio Value Over Time (approximate)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "Portfolio"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Line dataKey="value" stroke="#f97316" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground mt-2">Based on current prices applied to transaction history — not true historical prices.</p>
      </div>

      {/* Asset breakdown */}
      {assetBreakdown.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Asset Breakdown</p>
          {assetBreakdown.map((a) => (
            <div key={a.symbol} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{a.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  ${a.currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} now
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">${a.pastVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className={`text-xs ${a.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                  {a.change >= 0 ? "+" : ""}{a.changePct.toFixed(1)}% since then
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no base44 or PRICE_HISTORY hardcoded data**

```
grep -n "base44\|PRICE_HISTORY\|genBenchmark" src/pages/PortfolioRewind.jsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add src/pages/PortfolioRewind.jsx
git commit -m "feat(analytics): migrate PortfolioRewind — tx history rewind, remove hardcoded price multipliers"
```

---

## Task 9: Final verification

- [ ] **Step 1: Confirm no remaining base44 references in migrated files**

```
grep -rn "base44" src/pages/Analytics.jsx src/pages/PortfolioSnapshots.jsx src/pages/AdvancedAnalytics.jsx src/pages/PortfolioRiskScore.jsx src/pages/PortfolioBenchmark.jsx src/pages/PortfolioRewind.jsx
```

Expected: no output.

- [ ] **Step 2: Run full test suite**

```
npx vitest run
```

Expected: all tests pass (no regressions).

- [ ] **Step 3: Type-check**

```
npx tsc --project jsconfig.json --noEmit 2>&1 | head -20
```

Expected: 0 errors.
