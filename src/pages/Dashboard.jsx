import { useState, useEffect, useRef } from "react";
import FiatCurrencySelector, { formatFiat } from "../components/FiatCurrencySelector";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, ShieldAlert, ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock, XCircle, Lock, BarChart2, Bot, Newspaper, ShieldCheck, Search, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate, Link } from "react-router-dom";
import AccountHeader from "../components/AccountHeader";
import TokenList from "../components/TokenList";
import PortfolioChart from "../components/PortfolioChart";
import AssetDistributionChart from "../components/AssetDistributionChart";
import CryptoNewsFeed from "../components/CryptoNewsFeed";
import QuickLock from "../components/QuickLock";
import GasTracker from "../components/GasTracker";
import ExportTransactions from "../components/ExportTransactions";
import PortfolioHealthScore from "../components/PortfolioHealthScore";
import WatchlistWidget from "../components/WatchlistWidget";
import DashboardWidgetSettings, { DEFAULT_WIDGETS } from "../components/DashboardWidgetSettings";
import TransactionFilters from "../components/TransactionFilters";
import { formatDistanceToNow } from "date-fns";
import { DEMO } from "@/api/demoClient";
import WalletPortfolioPage from "./WalletPortfolioPage";
import { USD_RATES } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
const STATUS_ICONS = {
  pending: <Clock className="h-3.5 w-3.5 text-caution" />,
  confirmed: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

function generateAddress(currency) {
  const chars = "0123456789abcdef";
  let addr = currency === "BTC" ? "bc1q" : "0x";
  for (let i = 0; i < 32; i++) addr += chars[Math.floor(Math.random() * chars.length)];
  return addr;
}

// In the LOCAL/native build the dashboard is the REAL multi-wallet portfolio
// driven by the on-device vault (see WalletPortfolioPage). The seeded mock
// dashboard below is the DEMO tour only, so `npm run *:demo` is unchanged.
export default function Dashboard() {
  if (!DEMO) return <WalletPortfolioPage />;
  return <DemoDashboard />;
}

function DemoDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isLocked, setIsLocked] = useState(!DEMO);
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [selectedWalletId, setSelectedWalletId] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("ETH");
  // Rename an existing wallet (persisted via the local data layer). renameTarget
  // holds the wallet being edited; renameName the in-progress new name.
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [txFilters, setTxFilters] = useState({ asset: "", type: "", dateFrom: "", dateTo: "" });
  const [widgets, setWidgets] = useState(() => {
    try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem("dashboard-widgets") || "{}") }; }
    catch { return DEFAULT_WIDGETS; }
  });

  const saveWidgets = (next) => {
    setWidgets(next);
    localStorage.setItem("dashboard-widgets", JSON.stringify(next));
  };

  const { data: triggeredAlerts = [] } = useQuery({
    queryKey: ["price-alerts-triggered"],
    queryFn: () => base44.entities.PriceAlert.filter({ status: "triggered" }),
    refetchInterval: 60_000,
  });

  const { data: wallets = [], isLoading, dataUpdatedAt: walletsUpdatedAt } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
  });

  const createWallet = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.Wallet.create(data),
    onSuccess: (newWallet) => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setSelectedWalletId(newWallet.id);
      setOpen(false);
      setName("");
    },
  });

  // Persist a renamed wallet through the same local data layer that created it
  // (base44.entities.Wallet.update → IndexedDB), then refresh the wallets query
  // so every place the name shows (picker, cards, token list) updates.
  const renameWallet = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.Wallet.update(vars.id, { name: vars.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setRenameTarget(null);
      setRenameName("");
    },
  });

  const selectedWallet = wallets.find(w => w.id === selectedWalletId) || wallets[0];
  const totalUSD = wallets.reduce((sum, w) => sum + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const filteredTx = transactions.filter(tx => {
    if (txSearch && !(
      tx.currency?.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.to_address?.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.from_address?.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.type?.toLowerCase().includes(txSearch.toLowerCase())
    )) return false;
    if (txFilters.asset && tx.currency !== txFilters.asset) return false;
    if (txFilters.type && tx.type !== txFilters.type) return false;
    if (txFilters.dateFrom && new Date(tx.created_date) < new Date(txFilters.dateFrom)) return false;
    if (txFilters.dateTo && new Date(tx.created_date) > new Date(txFilters.dateTo + "T23:59:59")) return false;
    return true;
  });

  const [lastSynced, setLastSynced] = useState(new Date());
  const [displayValue, setDisplayValue] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    // Re-stamp the "last synced" time whenever the wallets query finishes loading
    // or its data actually refreshes. Depend on react-query's stable `dataUpdatedAt`
    // timestamp rather than the `wallets` array: the `= []` default produces a new
    // array reference every render when `data` is undefined (e.g. the query errored),
    // which would make this effect run every render and loop on setLastSynced.
    if (!isLoading) setLastSynced(new Date());
  }, [isLoading, walletsUpdatedAt]);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const start = displayValue;
    const end = totalUSD;
    const duration = 600;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + (end - start) * eased);
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [totalUSD]);

  const change24h = wallets.length > 0 ? ((totalUSD * 0.0234) / 100 * 97).toFixed(2) : 0;
  const changePercent = wallets.length > 0 ? 2.34 : 0;

  const syncLabel = (() => {
    const secs = Math.floor((Date.now() - /** @type {any} */ (lastSynced)) / 1000);
    if (secs < 10) return "Just now";
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  })();

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto space-y-4 p-1 animate-pulse">
        <div className="h-5 bg-secondary rounded w-32 mx-auto" />
        <div className="h-10 bg-secondary rounded w-48 mx-auto" />
        <div className="h-20 bg-secondary rounded-2xl" />
        <div className="grid grid-cols-4 gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl" />)}</div>
        <div className="h-40 bg-secondary rounded-2xl" />
        <div className="h-32 bg-secondary rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 relative">
      {isLocked && <QuickLock onUnlock={() => setIsLocked(false)} />}

      {/* Price Alert Banner */}
      {triggeredAlerts.length > 0 && (
        <Link to="/alerts" className="flex items-center gap-3 p-3 rounded-xl bg-caution/10 border border-caution/30 hover:border-caution/60 transition-colors">
          <span className="text-lg shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{triggeredAlerts.length} Price Alert{triggeredAlerts.length > 1 ? 's' : ''} Triggered!</p>
            <p className="text-xs text-muted-foreground truncate">
              {triggeredAlerts.map(a => `${a.currency} hit $${a.triggered_price?.toLocaleString()}`).join(' · ')}
            </p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-caution shrink-0" />
        </Link>
      )}

      {/* Portfolio Value */}
      <div className="text-center py-4 relative">
        <div className="absolute top-4 right-0">
          <DashboardWidgetSettings widgets={widgets} onChange={saveWidgets} />
        </div>
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Portfolio Value</p>
          <FiatCurrencySelector value={fiatCurrency} onChange={setFiatCurrency} />
        </div>
        <p className={`text-4xl font-bold transition-all duration-300 ${isLocked ? 'blur-md select-none' : ''}`}>
          {formatFiat(displayValue, fiatCurrency)}
        </p>
        <ReferenceRateNote />
        {!isLocked && wallets.length > 0 && (
          <div className="flex items-center justify-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
              ▲ {changePercent}% (24h)
            </span>
            <span className="text-[10px] text-muted-foreground">Synced {syncLabel}</span>
          </div>
        )}
        {!isLocked && (
          <button
            onClick={() => setIsLocked(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lock className="h-3 w-3" /> Lock Dashboard
          </button>
        )}
      </div>

      {/* Account Header */}
      {wallets.length > 0 && selectedWallet && (
        <AccountHeader
          wallet={selectedWallet}
          wallets={wallets}
          onWalletChange={(w) => setSelectedWalletId(w.id)}
          onRenameWallet={(w) => { setRenameTarget(w); setRenameName(w.name || ""); }}
        />
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => navigate("/send")}>
          <ArrowUpRight className="h-5 w-5" />
          <span className="text-xs">Send</span>
        </Button>
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => navigate("/receive")}>
          <ArrowDownLeft className="h-5 w-5" />
          <span className="text-xs">Receive</span>
        </Button>
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => navigate("/recurring")}>
          <CalendarClock className="h-5 w-5" />
          <span className="text-xs">Schedule</span>
        </Button>
        <Button variant="secondary" className="flex-col h-16 gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" />
          <span className="text-xs">Add</span>
        </Button>
      </div>

      {/* Portfolio Health Score */}
      {widgets.healthScore && <PortfolioHealthScore wallets={wallets} />}

      {/* Watchlist Widget */}
      {widgets.watchlist && <WatchlistWidget />}

      {/* Tabs: Tokens / Activity / Analytics */}
      <Tabs defaultValue="tokens" className="w-full">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="tokens" className="flex-1">Tokens</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="mt-3">
          {wallets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No wallets yet</p>
              <Button size="sm" className="mt-3" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />Add Wallet
              </Button>
            </div>
          ) : (
            <TokenList
              wallets={wallets}
              selectedId={selectedWallet?.id}
              onSelect={(w) => setSelectedWalletId(w.id)}
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <TransactionFilters filters={txFilters} onChange={setTxFilters} />
            <ExportTransactions transactions={filteredTx} />
          </div>
          {filteredTx.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted-foreground">
              {txSearch || Object.values(txFilters).some(Boolean) ? "No matching transactions" : "No transactions yet"}
            </p>
          ) : (
            filteredTx.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                  tx.type === "send" ? "bg-destructive/10" : "bg-success/10"
                }`}>
                  {tx.type === "send"
                    ? <ArrowUpRight className="h-4 w-4 text-destructive" />
                    : <ArrowDownLeft className="h-4 w-4 text-success" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium capitalize">{tx.type}</p>
                    {STATUS_ICONS[tx.status]}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {tx.type === "send" ? tx.to_address : tx.from_address}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${tx.type === "send" ? "text-destructive" : "text-success"}`}>
                    {tx.type === "send" ? "-" : "+"}{tx.amount} {tx.currency}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(tx.created_date), { addSuffix: true })}</p>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-3 space-y-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Portfolio Performance</p>
            <PortfolioChart transactions={transactions} currentBalance={totalUSD} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Asset Distribution</p>
            <AssetDistributionChart wallets={wallets} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Access Feature Grid */}
      {widgets.quickAccess && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Quick Access</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Receive", icon: ArrowDownLeft, path: "/receive", color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Security", icon: ShieldAlert, path: "/security", color: "text-yellow-400", bg: "bg-yellow-500/10" },
              { label: "Approvals", icon: Lock, path: "/token-approvals", color: "text-green-400", bg: "bg-green-500/10" },
              { label: "Address Check", icon: Search, path: "/address-checker", color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "AI Advisor", icon: Bot, path: "/advisor", color: "text-primary", bg: "bg-primary/10" },
              { label: "Analytics", icon: BarChart2, path: "/analytics", color: "text-indigo-400", bg: "bg-indigo-500/10" },
              { label: "Sentiment", icon: Newspaper, path: "/news-sentiment", color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { label: "Risk Score", icon: ShieldCheck, path: "/risk", color: "text-orange-400", bg: "bg-orange-500/10" },
            ].map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-center">
                <div className={`h-8 w-8 rounded-lg ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gas Tracker */}
      {widgets.gasTracker && <GasTracker />}

      {/* News Feed */}
      {widgets.newsFeed && (
        <div className="border-t border-border pt-4">
          <CryptoNewsFeed />
        </div>
      )}

      {/* Add Wallet Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Wallet</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="add-wallet-name">Wallet Name</Label>
              <Input id="add-wallet-name" value={name} onChange={e => setName(e.target.value)} placeholder="My ETH Wallet" className="mt-1.5" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!name || createWallet.isPending}
              onClick={() => createWallet.mutate({ name, currency, address: generateAddress(currency), balance: 0 })}
            >
              {createWallet.isPending ? "Creating..." : "Create Wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Wallet Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameName(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Wallet</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="rename-wallet-name">Wallet Name</Label>
              <Input
                id="rename-wallet-name"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                placeholder="My ETH Wallet"
                className="mt-1.5"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && renameName.trim() && !renameWallet.isPending) {
                    renameWallet.mutate({ id: renameTarget.id, name: renameName.trim() });
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!renameName.trim() || renameWallet.isPending}
              onClick={() => renameWallet.mutate({ id: renameTarget.id, name: renameName.trim() })}
            >
              {renameWallet.isPending ? "Saving..." : "Save Name"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}