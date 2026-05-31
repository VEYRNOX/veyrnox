import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle2,
  Save, Bell, Zap, Fuel, Clock, MailCheck
} from "lucide-react";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COLORS = { BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", BNB: "#F3BA2F", SOL: "#9945FF", USDC: "#2775CA", XRP: "#0085C0", DOGE: "#C2A633", ADA: "#0033AD", TRX: "#EB0029" };
const ICONS = { BTC: "₿", ETH: "Ξ", SOL: "◎", USDC: "Ⓢ", USDT: "₮" };
const GAS_COSTS = { ETH: 3.5, BTC: 5.0, SOL: 0.01, USDC: 0.5, USDT: 0.5 };

const fmt = (n) => "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtCrypto = (n, currency) => {
  const abs = Math.abs(n);
  const decimals = ["USDC", "USDT"].includes(currency) ? 2 : abs < 0.01 ? 6 : 4;
  return abs.toFixed(decimals) + " " + currency;
};

function gasRatio(deltaUSD, currency) {
  return (GAS_COSTS[currency] || 0.5) / Math.max(Math.abs(deltaUSD), 0.01);
}

export default function Rebalancing() {
  const queryClient = useQueryClient();

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const { data: configs = [], isLoading: loadingConfig } = useQuery({
    queryKey: ["rebalancing-config"],
    queryFn: () => base44.entities.RebalancingConfig.list(),
  });

  const config = configs[0] || null;

  // Local state — sync from saved config
  const [targets, setTargets] = useState({});
  const [driftThreshold, setDriftThreshold] = useState(5);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [runningCheck, setRunningCheck] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setTargets(config.allocations || {});
      setDriftThreshold(config.drift_threshold ?? 5);
      setMonitoringEnabled(config.monitoring_enabled ?? false);
      setAlertEmail(config.alert_email || "");
    }
  }, [config]);

  const holdings = useMemo(() => {
    const map = {};
    for (const w of wallets) map[w.currency] = (map[w.currency] || 0) + (w.balance || 0);
    return map;
  }, [wallets]);

  const assets = useMemo(() => Object.keys(holdings).filter(c => holdings[c] > 0), [holdings]);

  const totalUSD = useMemo(
    () => Object.entries(holdings).reduce((s, [c, b]) => s + b * (USD_RATES[c] || 1), 0),
    [holdings]
  );

  const effectiveTargets = useMemo(() => {
    if (assets.length === 0) return {};
    const defaultPct = Math.floor(100 / assets.length);
    const remainder = 100 - defaultPct * assets.length;
    const result = {};
    assets.forEach((a, i) => {
      result[a] = targets[a] ?? (i === 0 ? defaultPct + remainder : defaultPct);
    });
    return result;
  }, [assets, targets]);

  const totalTarget = useMemo(
    () => Object.values(effectiveTargets).reduce((s, v) => s + v, 0),
    [effectiveTargets]
  );

  const handleSlider = (currency, value) => {
    const newVal = value[0];
    const others = assets.filter(a => a !== currency);
    const remaining = 100 - newVal;
    const currentOthersTotal = others.reduce((s, a) => s + (effectiveTargets[a] ?? 0), 0);
    const newTargets = { ...effectiveTargets, [currency]: newVal };
    if (others.length > 0 && currentOthersTotal > 0) {
      others.forEach(a => {
        newTargets[a] = Math.round((effectiveTargets[a] / currentOthersTotal) * remaining);
      });
      const total = Object.values(newTargets).reduce((s, v) => s + v, 0);
      const diff = 100 - total;
      if (diff !== 0) {
        const last = others[others.length - 1];
        newTargets[last] = Math.max(0, (newTargets[last] || 0) + diff);
      }
    }
    setTargets(newTargets);
  };

  // All trades (unfiltered)
  const allTrades = useMemo(() => {
    if (totalUSD === 0 || totalTarget !== 100) return [];
    return assets.map(currency => {
      const currentUSD = (holdings[currency] || 0) * (USD_RATES[currency] || 1);
      const targetUSD = (totalUSD * (effectiveTargets[currency] || 0)) / 100;
      const deltaUSD = targetUSD - currentUSD;
      const deltaCrypto = deltaUSD / (USD_RATES[currency] || 1);
      const currentPct = totalUSD > 0 ? (currentUSD / totalUSD) * 100 : 0;
      const gas = GAS_COSTS[currency] || 0.5;
      const ratio = gasRatio(deltaUSD, currency);
      const efficient = ratio < 0.02 && Math.abs(deltaUSD) > 0.5;
      return { currency, currentUSD, targetUSD, deltaUSD, deltaCrypto, currentPct, gas, ratio, efficient };
    }).filter(t => Math.abs(t.deltaUSD) > 0.5)
      .sort((a, b) => Math.abs(b.deltaUSD) - Math.abs(a.deltaUSD));
  }, [assets, holdings, effectiveTargets, totalUSD, totalTarget]);

  const efficientTrades = allTrades.filter(t => t.efficient);
  const skippedTrades = allTrades.filter(t => !t.efficient);
  const gasSaved = skippedTrades.reduce((s, t) => s + (t.gas || 0), 0);

  // Drift analysis vs saved targets
  const driftAnalysis = useMemo(() => {
    if (!config?.allocations || totalUSD === 0) return [];
    return Object.entries(config.allocations).map(([currency, targetPct]) => {
      const currentUSD = (holdings[currency] || 0) * (USD_RATES[currency] || 1);
      const currentPct = (currentUSD / totalUSD) * 100;
      const drift = currentPct - targetPct;
      return { currency, currentPct, targetPct, drift, isDrifted: Math.abs(drift) > (config.drift_threshold || 5) };
    });
  }, [config, holdings, totalUSD]);

  const driftedAssets = driftAnalysis.filter(d => d.isDrifted);

  // Save config
  const saveConfig = useMutation({
    mutationFn: async () => {
      const data = {
        allocations: effectiveTargets,
        drift_threshold: driftThreshold,
        monitoring_enabled: monitoringEnabled,
        alert_email: alertEmail,
      };
      if (config) return base44.entities.RebalancingConfig.update(config.id, data);
      return base44.entities.RebalancingConfig.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebalancing-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Execute rebalancing trades
  const [executing, setExecuting] = useState(false);
  const executeRebalancing = async () => {
    if (efficientTrades.length === 0) return;
    setExecuting(true);
    try {
      for (const trade of efficientTrades) {
        const walletForCurrency = wallets.find(w => w.currency === trade.currency);
        if (!walletForCurrency) continue;
        const newBalance = Math.max(0, (walletForCurrency.balance || 0) + trade.deltaCrypto);
        await base44.entities.Wallet.update(walletForCurrency.id, { balance: parseFloat(newBalance.toFixed(8)) });
        const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        await base44.entities.Transaction.create({ wallet_id: walletForCurrency.id, type: trade.deltaUSD > 0 ? "receive" : "send", amount: Math.abs(trade.deltaCrypto), currency: trade.currency, status: "confirmed", tx_hash: txHash, note: `Auto-rebalancing: ${trade.deltaUSD > 0 ? "BUY" : "SELL"} ${trade.currency}` });
      }
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } finally {
      setExecuting(false);
    }
  };

  // Manual run
  const runManualCheck = async () => {
    setRunningCheck(true);
    await base44.functions.invoke("rebalancingMonitor", {});
    queryClient.invalidateQueries({ queryKey: ["rebalancing-config"] });
    setRunningCheck(false);
  };

  if (assets.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-3">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-lg font-semibold">No assets found</p>
        <p className="text-sm text-muted-foreground">Add wallets with balances to use rebalancing.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auto Rebalance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Target allocations &amp; gas-efficient trades</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 mt-1"
          disabled={totalTarget !== 100 || saveConfig.isPending}
          onClick={() => saveConfig.mutate()}
        >
          {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? "Saved!" : "Save"}
        </Button>
      </div>

      {/* Drift alert banner */}
      {driftedAssets.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-3">
          <Bell className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400">{driftedAssets.length} asset{driftedAssets.length > 1 ? "s" : ""} have drifted beyond your {config?.drift_threshold || 5}% threshold</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {driftedAssets.map(d => `${d.currency} (${d.drift > 0 ? "+" : ""}${d.drift.toFixed(1)}%)`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="allocations">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="allocations" className="flex-1">Allocations</TabsTrigger>
          <TabsTrigger value="trades" className="flex-1">Trades</TabsTrigger>
          <TabsTrigger value="monitor" className="flex-1">Monitor</TabsTrigger>
        </TabsList>

        {/* ── Allocations Tab ── */}
        <TabsContent value="allocations" className="mt-3 space-y-4">
          {/* Portfolio bar */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <div className="flex justify-between items-baseline">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Portfolio Value</p>
              <p className="text-xl font-bold">${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="flex rounded-full overflow-hidden h-2.5">
              {assets.map(c => {
                const pct = totalUSD > 0 ? ((holdings[c] * (USD_RATES[c] || 1)) / totalUSD) * 100 : 0;
                return <div key={c} style={{ width: pct + "%", background: COLORS[c] || "#888" }} />;
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              {assets.map(c => {
                const pct = totalUSD > 0 ? ((holdings[c] * (USD_RATES[c] || 1)) / totalUSD) * 100 : 0;
                return (
                  <div key={c} className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full" style={{ background: COLORS[c] || "#888" }} />
                    <span className="text-[10px] text-muted-foreground">{c} {pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sliders */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Target Allocation</p>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                totalTarget === 100 ? "bg-green-500/15 text-green-400" : "bg-destructive/15 text-destructive"
              }`}>
                {totalTarget}% / 100%
              </span>
            </div>
            {assets.map(currency => {
              const pct = effectiveTargets[currency] ?? 0;
              const currentPct = totalUSD > 0 ? ((holdings[currency] * (USD_RATES[currency] || 1)) / totalUSD) * 100 : 0;
              return (
                <div key={currency} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: (COLORS[currency] || "#888") + "22", color: COLORS[currency] || "#888" }}>
                        {ICONS[currency] || currency[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{currency}</p>
                        <p className="text-[10px] text-muted-foreground">now {currentPct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: COLORS[currency] || "#888" }}>{pct}%</p>
                      <p className="text-[10px] text-muted-foreground">{fmt((totalUSD * pct) / 100)}</p>
                    </div>
                  </div>
                  <Slider min={0} max={100} step={1} value={[pct]}
                    onValueChange={(v) => handleSlider(currency, v)} className="w-full" />
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Trades Tab ── */}
        <TabsContent value="trades" className="mt-3 space-y-4">
          {totalTarget !== 100 && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Targets must total 100% before calculating trades.</p>
            </div>
          )}

          {totalTarget === 100 && allTrades.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" />
              <p className="text-sm font-medium">Portfolio is balanced</p>
              <p className="text-xs text-muted-foreground">No trades needed right now.</p>
            </div>
          )}

          {totalTarget === 100 && efficientTrades.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Gas-Efficient Trades ({efficientTrades.length})</p>
              </div>
              <div className="divide-y divide-border">
                {efficientTrades.map(t => {
                  const isBuy = t.deltaUSD > 0;
                  return (
                    <div key={t.currency} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isBuy ? "bg-green-500/15" : "bg-destructive/15"}`}>
                          {isBuy ? <TrendingUp className="h-4 w-4 text-green-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            <span className={isBuy ? "text-green-400" : "text-destructive"}>{isBuy ? "BUY" : "SELL"}</span>
                            {" "}{t.currency}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {t.currentPct.toFixed(1)}% → {effectiveTargets[t.currency]}% · gas ~${t.gas.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold font-mono ${isBuy ? "text-green-400" : "text-destructive"}`}>
                          {isBuy ? "+" : "-"}{fmt(t.deltaUSD)}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {isBuy ? "+" : "-"}{fmtCrypto(t.deltaCrypto, t.currency)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-border space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total to buy</span>
                  <span className="text-green-400 font-mono">+{fmt(efficientTrades.filter(t => t.deltaUSD > 0).reduce((s, t) => s + t.deltaUSD, 0))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total to sell</span>
                  <span className="text-destructive font-mono">-{fmt(efficientTrades.filter(t => t.deltaUSD < 0).reduce((s, t) => s + Math.abs(t.deltaUSD), 0))}</span>
                </div>
                <Button className="w-full mt-2 gap-2" onClick={executeRebalancing} disabled={executing}>
                  {executing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {executing ? "Executing…" : "Execute Rebalancing"}
                </Button>
              </div>
            </div>
          )}

          {skippedTrades.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden opacity-60">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Fuel className="h-4 w-4 text-yellow-500" />
                <p className="text-sm font-semibold">Skipped — High Gas Cost ({skippedTrades.length})</p>
                <span className="ml-auto text-xs text-green-400">~${gasSaved.toFixed(2)} saved</span>
              </div>
              <div className="divide-y divide-border">
                {skippedTrades.map(t => (
                  <div key={t.currency} className="px-4 py-2.5 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t.deltaUSD > 0 ? "BUY" : "SELL"} {t.currency} · trade value {fmt(t.deltaUSD)} vs ~${t.gas.toFixed(2)} gas
                    </p>
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
                      {(t.ratio * 100).toFixed(0)}% gas ratio
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Monitor Tab ── */}
        <TabsContent value="monitor" className="mt-3 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Automated Monitoring</p>
                <p className="text-xs text-muted-foreground mt-0.5">Checks every 6 hours, emails on drift</p>
              </div>
              <Switch checked={monitoringEnabled} onCheckedChange={setMonitoringEnabled} />
            </div>

            <div>
              <Label className="text-xs">Drift Alert Threshold</Label>
              <div className="flex items-center gap-3 mt-2">
                <Slider
                  min={1} max={20} step={1}
                  value={[driftThreshold]}
                  onValueChange={([v]) => setDriftThreshold(v)}
                  className="flex-1"
                />
                <span className="text-sm font-bold w-10 text-right">{driftThreshold}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Alert when any asset drifts more than {driftThreshold}% from target</p>
            </div>

            <div>
              <Label className="text-xs">Alert Email</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={alertEmail}
                  onChange={e => setAlertEmail(e.target.value)}
                />
                <MailCheck className="h-4 w-4 text-muted-foreground self-center shrink-0" />
              </div>
            </div>
          </div>

          {config?.last_checked_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Clock className="h-3.5 w-3.5" />
              Last checked {moment(config.last_checked_at).fromNow()}
              {config.last_alert_at && (
                <span className="ml-2">· Last alert {moment(config.last_alert_at).fromNow()}</span>
              )}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={runManualCheck}
            disabled={runningCheck || !config}
          >
            {runningCheck ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Check Now
          </Button>

          {!config && (
            <p className="text-xs text-muted-foreground text-center">Save your allocations first to enable monitoring.</p>
          )}

          {/* Drift status per asset */}
          {driftAnalysis.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Current Drift Status</p>
              </div>
              <div className="divide-y divide-border">
                {driftAnalysis.map(d => (
                  <div key={d.currency} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold"
                        style={{ background: (COLORS[d.currency] || "#888") + "22", color: COLORS[d.currency] || "#888" }}>
                        {ICONS[d.currency] || d.currency[0]}
                      </div>
                      <p className="text-sm">{d.currency}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">{d.currentPct.toFixed(1)}% / {d.targetPct}%</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.isDrifted ? "bg-yellow-500/15 text-yellow-400" : "bg-green-500/15 text-green-400"
                      }`}>
                        {d.drift > 0 ? "+" : ""}{d.drift.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}