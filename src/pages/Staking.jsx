import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, Zap, Lock, Unlock, Plus, Award, RefreshCw,
  Clock, Calendar, CheckCircle2, ChevronDown, ChevronUp
} from "lucide-react";
import StakingAnalytics from "../components/staking/StakingAnalytics";
import MFADialog from "../components/security/MFADialog";
import AutoStakingStrategies from "../components/staking/AutoStakingStrategies";
import UnstakingManager from "../components/staking/UnstakingManager";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const COLORS    = { BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", USDC: "#2775CA", USDT: "#26A17B" };
const ICONS     = { BTC: "₿", ETH: "Ξ", SOL: "◎", USDC: "Ⓢ", USDT: "₮" };

const VALIDATORS = {
  ETH: [
    { id: "lido",       name: "Lido Finance",    apy: 3.9, commission: 10, uptime: 99.98, delegators: "890K+" },
    { id: "rocketpool", name: "Rocket Pool",      apy: 3.6, commission: 15, uptime: 99.95, delegators: "210K+" },
    { id: "coinbase",   name: "Coinbase Cloud",   apy: 3.2, commission: 25, uptime: 99.99, delegators: "1.2M+" },
  ],
  SOL: [
    { id: "marinade",   name: "Marinade Finance", apy: 7.2, commission: 6,  uptime: 99.97, delegators: "72K+" },
    { id: "jito",       name: "Jito Labs",         apy: 8.1, commission: 4,  uptime: 99.96, delegators: "45K+" },
    { id: "everstake",  name: "Everstake",         apy: 6.8, commission: 7,  uptime: 99.93, delegators: "30K+" },
  ],
  BTC: [
    { id: "babylon1",   name: "Babylon Staking",  apy: 5.5, commission: 5,  uptime: 99.91, delegators: "18K+" },
    { id: "corebTC",    name: "CoreDAO BTC",       apy: 4.8, commission: 8,  uptime: 99.89, delegators: "10K+" },
  ],
  USDC: [
    { id: "aave",       name: "Aave v3",           apy: 5.1, commission: 10, uptime: 100,   delegators: "500K+" },
    { id: "compound",   name: "Compound Finance",  apy: 4.6, commission: 10, uptime: 99.99, delegators: "300K+" },
  ],
  USDT: [
    { id: "aave_usdt",  name: "Aave v3 (USDT)",   apy: 4.9, commission: 10, uptime: 100,   delegators: "400K+" },
  ],
};

function calcPendingRewards(position) {
  if (position.status !== "active" || !position.staked_at) return 0;
  const hoursElapsed  = moment().diff(moment(position.staked_at), "hours", true);
  const annualRewards = position.staked_amount * (position.apy / 100);
  return (annualRewards / 8760) * hoursElapsed;
}

const calcDailyRewards   = (p) => (p.staked_amount * (p.apy / 100)) / 365;
const calcMonthlyRewards = (p) => calcDailyRewards(p) * 30;

const fmt    = (n, d = 4) => Number(n).toFixed(d);
const fmtUSD = (n)        => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Staking() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen]         = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("ETH");
  const [selectedValidator, setSelectedValidator] = useState(null);
  const [stakeAmount, setStakeAmount]       = useState("");
  const [claimingId, setClaimingId]         = useState(null);
  const [mfaOpen, setMfaOpen]               = useState(false);
  const [pendingMfaAction, setPendingMfaAction] = useState(null);
  const [mfaDescription, setMfaDescription] = useState("");
  const [expandedId, setExpandedId]         = useState(null);
  const [tick, setTick]                     = useState(0);

  // Live 1-second ticker so pending rewards update in real-time
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["staking-positions"],
    queryFn: () => base44.entities.StakingPosition.list("-created_date"),
    refetchInterval: 30_000,
  });

  const createPosition = useMutation({
    mutationFn: (data) => base44.entities.StakingPosition.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staking-positions"] });
      setDialogOpen(false);
      setStakeAmount("");
      setSelectedValidator(null);
    },
  });

  const updatePosition = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StakingPosition.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staking-positions"] }),
  });

  const holdings = useMemo(() => {
    const map = {};
    for (const w of wallets) map[w.currency] = (map[w.currency] || 0) + (w.balance || 0);
    return map;
  }, [wallets]);

  const activePositions   = positions.filter(p => p.status === "active");
  const unstakingPositions = positions.filter(p => p.status === "unstaking");
  const validators        = VALIDATORS[selectedCurrency] || [];

  // Recalculate pending totals on every tick
  const totalPendingUSD = useMemo(
    () => activePositions.reduce((s, p) => s + calcPendingRewards(p) * (USD_RATES[p.currency] || 1), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, tick]
  );
  const totalStakedUSD  = activePositions.reduce((s, p) => s + (p.staked_amount || 0) * (USD_RATES[p.currency] || 1), 0);
  const totalDailyUSD   = activePositions.reduce((s, p) => s + calcDailyRewards(p) * (USD_RATES[p.currency] || 1), 0);
  const totalClaimedUSD = positions.reduce((s, p) => s + (p.rewards_claimed || 0) * (USD_RATES[p.currency] || 1), 0);

  const handleStake = () => {
    if (!selectedValidator || !stakeAmount || parseFloat(stakeAmount) <= 0) return;
    createPosition.mutate({
      currency: selectedCurrency,
      validator_id: selectedValidator.id,
      validator_name: selectedValidator.name,
      staked_amount: parseFloat(stakeAmount),
      apy: selectedValidator.apy,
      status: "active",
      staked_at: new Date().toISOString(),
      rewards_claimed: 0,
    });
  };

  const handleUnstake = (position) => {
    setPendingMfaAction(() => async () => {
      await updatePosition.mutateAsync({
        id: position.id,
        data: { status: "unstaking", unstake_requested_at: new Date().toISOString() },
      });
    });
    setMfaDescription(`Unstake ${fmt(position.staked_amount, 4)} ${position.currency} from ${position.validator_name}`);
    setMfaOpen(true);
  };

  const handleClaimRewards = (position) => {
    setPendingMfaAction(() => async () => {
      setClaimingId(position.id);
      const rewards = calcPendingRewards(position);
      await updatePosition.mutateAsync({
        id: position.id,
        data: {
          rewards_claimed: (position.rewards_claimed || 0) + rewards,
          staked_at: new Date().toISOString(),
        },
      });
      setClaimingId(null);
    });
    setMfaDescription(`Claim staking rewards from ${position.validator_name} (${position.currency})`);
    setMfaOpen(true);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staking</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Earn yield on idle assets</p>
        </div>
        <Button size="sm" className="gap-1.5 mt-1" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Delegate
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Lock className="h-3.5 w-3.5" /> Total Staked
          </div>
          <p className="text-xl font-bold">{fmtUSD(totalStakedUSD)}</p>
          <p className="text-[10px] text-muted-foreground">{activePositions.length} active position{activePositions.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-green-500/30 bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Award className="h-3.5 w-3.5 text-green-400" /> Pending Rewards
          </div>
          <p className="text-xl font-bold text-green-400 tabular-nums">{fmtUSD(totalPendingUSD)}</p>
          <p className="text-[10px] text-muted-foreground">Live · updates every second</p>
        </div>
      </div>

      {activePositions.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-blue-500/20 bg-card p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Calendar className="h-3.5 w-3.5 text-blue-400" /> Daily Accrual
            </div>
            <p className="text-lg font-bold text-blue-400">{fmtUSD(totalDailyUSD)}</p>
            <p className="text-[10px] text-muted-foreground">{fmtUSD(totalDailyUSD * 30)}/mo projected</p>
          </div>
          <div className="rounded-2xl border border-orange-500/20 bg-card p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" /> Total Claimed
            </div>
            <p className="text-lg font-bold text-orange-400">{fmtUSD(totalClaimedUSD)}</p>
            <p className="text-[10px] text-muted-foreground">All-time rewards claimed</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="positions">
        <TabsList className="w-full bg-secondary grid grid-cols-4">
          <TabsTrigger value="positions" className="text-[11px]">Positions</TabsTrigger>
          <TabsTrigger value="analytics" className="text-[11px]">Analytics</TabsTrigger>
          <TabsTrigger value="strategies" className="text-[11px]">Strategies</TabsTrigger>
          <TabsTrigger value="unstaking" className="text-[11px]">Unstaking</TabsTrigger>
        </TabsList>

        {/* Active Positions */}
        <TabsContent value="positions" className="mt-3 space-y-3">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && positions.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Zap className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No staking positions yet</p>
              <p className="text-xs text-muted-foreground">Delegate assets to earn passive yield.</p>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Stake Now
              </Button>
            </div>
          )}

          {[...activePositions, ...unstakingPositions].map(position => {
            const pendingRewards = calcPendingRewards(position);
            const usdStaked      = (position.staked_amount || 0) * (USD_RATES[position.currency] || 1);
            const usdRewards     = pendingRewards * (USD_RATES[position.currency] || 1);
            const dailyRewards   = calcDailyRewards(position);
            const monthlyRewards = calcMonthlyRewards(position);
            const dailyUSD       = dailyRewards * (USD_RATES[position.currency] || 1);
            const monthlyUSD     = monthlyRewards * (USD_RATES[position.currency] || 1);
            const isClaiming     = claimingId === position.id;
            const isExpanded     = expandedId === position.id;
            const daysStaked     = moment().diff(moment(position.staked_at), "days");

            return (
              <div key={position.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center text-lg font-bold"
                        style={{ background: (COLORS[position.currency] || "#888") + "22", color: COLORS[position.currency] || "#888" }}
                      >
                        {ICONS[position.currency] || position.currency[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{position.validator_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {position.currency} · {daysStaked}d staked · {moment(position.staked_at).format("MMM D, YYYY")}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      position.status === "active"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}>
                      {position.status === "active" ? "● Active" : "⏳ Unstaking"}
                    </span>
                  </div>

                  {/* Primary metrics */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">Staked</p>
                      <p className="text-xs font-bold">{fmt(position.staked_amount, 4)} {position.currency}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtUSD(usdStaked)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">APY</p>
                      <p className="text-xs font-bold text-green-400">{position.apy}%</p>
                      <p className="text-[10px] text-muted-foreground">annual</p>
                    </div>
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                      <p className="text-[10px] text-muted-foreground">Pending</p>
                      <p className="text-xs font-bold text-green-400 tabular-nums">{fmt(pendingRewards, 6)}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtUSD(usdRewards)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {position.status === "active" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={() => handleClaimRewards(position)}
                        disabled={isClaiming || pendingRewards < 0.000001}
                      >
                        {isClaiming
                          ? <RefreshCw className="h-3 w-3 animate-spin" />
                          : <Award className="h-3 w-3 text-green-400" />}
                        Claim {fmtUSD(usdRewards)}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => handleUnstake(position)}
                      >
                        <Unlock className="h-3 w-3" /> Unstake
                      </Button>
                    </div>
                  )}
                  {position.status === "unstaking" && (
                    <p className="text-xs text-yellow-500 text-center">
                      Unbonding · Est. available {moment(position.unstake_requested_at).add(7, "days").format("MMM D")}
                    </p>
                  )}

                  {/* Expand toggle */}
                  <button
                    className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors pt-0.5"
                    onClick={() => setExpandedId(isExpanded ? null : position.id)}
                  >
                    {isExpanded
                      ? <><ChevronUp className="h-3 w-3" /> Hide accrual details</>
                      : <><ChevronDown className="h-3 w-3" /> Show accrual details</>}
                  </button>
                </div>

                {/* Expanded accrual breakdown */}
                {isExpanded && (
                  <div className="border-t border-border bg-secondary/20 px-4 py-3 space-y-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Reward Accrual Rate</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Per Second", value: fmt(dailyRewards / 86400, 10), usd: fmtUSD(dailyUSD / 86400), icon: <Clock className="h-3 w-3" /> },
                        { label: "Per Hour",   value: fmt(dailyRewards / 24, 8),   usd: fmtUSD(dailyUSD / 24),   icon: <Clock className="h-3 w-3" /> },
                        { label: "Per Day",    value: fmt(dailyRewards, 6),         usd: fmtUSD(dailyUSD),         icon: <Calendar className="h-3 w-3" /> },
                        { label: "Per Month",  value: fmt(monthlyRewards, 4),       usd: fmtUSD(monthlyUSD),       icon: <Calendar className="h-3 w-3" /> },
                      ].map(item => (
                        <div key={item.label} className="rounded-lg bg-card border border-border p-2.5 flex items-center gap-2">
                          <span className="text-muted-foreground shrink-0">{item.icon}</span>
                          <div>
                            <p className="text-[10px] text-muted-foreground">{item.label}</p>
                            <p className="text-xs font-bold tabular-nums">
                              {item.value} <span className="text-muted-foreground font-normal text-[10px]">{position.currency}</span>
                            </p>
                            <p className="text-[10px] text-blue-400">{item.usd}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(position.rewards_claimed || 0) > 0 && (
                      <div className="flex items-center justify-between rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" />
                          <p className="text-xs text-muted-foreground">Previously Claimed</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-orange-400">{fmt(position.rewards_claimed, 6)} {position.currency}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtUSD((position.rewards_claimed || 0) * (USD_RATES[position.currency] || 1))}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="analytics" className="mt-3">
          <StakingAnalytics positions={positions} />
        </TabsContent>

        <TabsContent value="strategies" className="mt-3">
          <AutoStakingStrategies positions={positions} wallets={wallets} />
        </TabsContent>

        <TabsContent value="unstaking" className="mt-3">
          <UnstakingManager positions={positions} />
        </TabsContent>

        {/* Validator Explorer */}
        <TabsContent value="validators" className="mt-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {Object.keys(VALIDATORS).map(c => (
              <button
                key={c}
                onClick={() => setSelectedCurrency(c)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  selectedCurrency === c
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                style={selectedCurrency === c ? { background: COLORS[c] || "#888" } : {}}
              >
                {c}
              </button>
            ))}
          </div>

          {(VALIDATORS[selectedCurrency] || []).map(v => (
            <div key={v.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{v.name}</p>
                  <p className="text-[10px] text-muted-foreground">{v.delegators} delegators</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">{v.apy}%</p>
                  <p className="text-[10px] text-muted-foreground">APY</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-secondary/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Commission</p>
                  <p className="font-semibold">{v.commission}%</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Uptime</p>
                  <p className="font-semibold text-green-400">{v.uptime}%</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Network</p>
                  <p className="font-semibold">{selectedCurrency}</p>
                </div>
              </div>
              <Button size="sm" className="w-full gap-1.5 text-xs" onClick={() => {
                setSelectedValidator(v);
                setDialogOpen(true);
              }}>
                <TrendingUp className="h-3.5 w-3.5" /> Stake with {v.name}
              </Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <MFADialog
        open={mfaOpen}
        onOpenChange={setMfaOpen}
        onVerified={pendingMfaAction || (() => {})}
        actionDescription={mfaDescription}
      />

      {/* Stake Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setSelectedValidator(null); setStakeAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delegate Assets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Asset</Label>
              <Select value={selectedCurrency} onValueChange={(v) => { setSelectedCurrency(v); setSelectedValidator(null); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(VALIDATORS).map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: COLORS[c] }}>{ICONS[c]}</span> {c}
                        {holdings[c] > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">({fmt(holdings[c], 4)} available)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Validator</Label>
              <Select
                value={selectedValidator?.id || ""}
                onValueChange={id => setSelectedValidator(validators.find(v => v.id === id))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose validator..." />
                </SelectTrigger>
                <SelectContent>
                  {validators.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center justify-between gap-4 w-full">
                        <span>{v.name}</span>
                        <span className="text-green-400 text-xs font-semibold">{v.apy}% APY</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedValidator && (
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Expected annual yield</p>
                  <p className="text-sm font-bold text-green-400">{selectedValidator.apy}% APY · {selectedValidator.commission}% commission</p>
                </div>
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
            )}

            <div>
              <Label>Amount ({selectedCurrency})</Label>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={stakeAmount}
                  onChange={e => setStakeAmount(e.target.value)}
                />
                {holdings[selectedCurrency] > 0 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary font-semibold hover:underline"
                    onClick={() => setStakeAmount(String(holdings[selectedCurrency]))}
                  >
                    MAX
                  </button>
                )}
              </div>
              {stakeAmount && selectedValidator && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {fmtUSD(parseFloat(stakeAmount) * (USD_RATES[selectedCurrency] || 1))} staked · earns ~{fmtUSD(parseFloat(stakeAmount) * (USD_RATES[selectedCurrency] || 1) * selectedValidator.apy / 100)}/yr
                </p>
              )}
            </div>

            <Button
              className="w-full gap-2"
              disabled={!selectedValidator || !stakeAmount || parseFloat(stakeAmount) <= 0 || createPosition.isPending}
              onClick={handleStake}
            >
              {createPosition.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {createPosition.isPending ? "Delegating..." : "Stake Now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}