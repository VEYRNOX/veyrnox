import { useState, useEffect } from "react";
import { Flame, Zap, Clock, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { id: "slow", label: "Slow", icon: Clock, time: "~5 min", baseFee: 12, priority: 1, color: "text-blue-500" },
  { id: "standard", label: "Standard", icon: Zap, time: "~1 min", baseFee: 18, priority: 2, color: "text-yellow-500" },
  { id: "fast", label: "Fast", icon: Flame, time: "~15 sec", baseFee: 24, priority: 5, color: "text-orange-500" },
  { id: "custom", label: "Custom", icon: CheckCircle, time: "Manual", baseFee: 0, priority: 0, color: "text-primary" },
];

const ETH_USD = 3200;

export default function GasFeeControl() {
  const [selected, setSelected] = useState("standard");
  const [baseFee, setBaseFee] = useState(18);
  const [priorityFee, setPriorityFee] = useState(2);
  const [gasLimit, setGasLimit] = useState(21000);
  const [liveBase, setLiveBase] = useState(18.4);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveBase(prev => +(prev + (Math.random() - 0.5) * 2).toFixed(1));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const applyPreset = (preset) => {
    setSelected(preset.id);
    if (preset.id !== "custom") {
      setBaseFee(preset.baseFee + Math.round(liveBase - 18));
      setPriorityFee(preset.priority);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setLiveBase(+(Math.random() * 20 + 10).toFixed(1));
    setRefreshing(false);
  };

  const maxFeeGwei = baseFee + priorityFee;
  const gasCostEth = (maxFeeGwei * gasLimit) / 1e9;
  const gasCostUsd = gasCostEth * ETH_USD;

  const COMMON_LIMITS = [
    { label: "ETH Transfer", value: 21000 },
    { label: "ERC-20 Transfer", value: 65000 },
    { label: "Uniswap Swap", value: 150000 },
    { label: "NFT Mint", value: 200000 },
    { label: "Complex DeFi", value: 500000 },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Gas Fee Control</h1>
        <p className="text-sm text-muted-foreground">Configure EIP-1559 transaction fees</p>
      </div>

      {/* Live base fee */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Live Network Base Fee</p>
          <button onClick={refresh} className={`p-1.5 text-muted-foreground hover:text-foreground ${refreshing ? "animate-spin" : ""}`}><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="flex items-end gap-3">
          <p className="text-3xl font-bold">{liveBase} <span className="text-lg text-muted-foreground">Gwei</span></p>
          <div className={`text-xs px-2 py-1 rounded-lg font-semibold mb-1 ${liveBase < 15 ? "bg-green-500/10 text-green-500" : liveBase < 30 ? "bg-yellow-500/10 text-yellow-500" : "bg-destructive/10 text-destructive"}`}>
            {liveBase < 15 ? "Low" : liveBase < 30 ? "Normal" : "High"}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className={`h-6 flex-1 rounded-sm ${i < Math.round(liveBase / 5) ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
      </div>

      {/* Speed presets */}
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p)}
            className={`p-3 rounded-xl border text-center transition-colors ${selected === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <p.icon className={`h-4 w-4 mx-auto mb-1 ${selected === p.id ? "text-primary" : p.color}`} />
            <p className="text-xs font-semibold">{p.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{p.time}</p>
          </button>
        ))}
      </div>

      {/* Manual controls */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <Label>Base Fee (Gwei)</Label>
            <span className="text-sm font-mono font-semibold">{baseFee}</span>
          </div>
          <Slider value={[baseFee]} min={1} max={100} step={1} onValueChange={([v]) => { setBaseFee(v); setSelected("custom"); }} />
        </div>
        <div>
          <div className="flex justify-between mb-2">
            <Label>Priority Fee / Tip (Gwei)</Label>
            <span className="text-sm font-mono font-semibold">{priorityFee}</span>
          </div>
          <Slider value={[priorityFee]} min={0} max={20} step={0.5} onValueChange={([v]) => { setPriorityFee(v); setSelected("custom"); }} />
        </div>
        <div>
          <Label className="mb-2 block">Gas Limit</Label>
          <div className="flex gap-2 items-center">
            <Input type="number" value={gasLimit} onChange={e => setGasLimit(parseInt(e.target.value) || 21000)} className="font-mono" />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMMON_LIMITS.map(l => (
              <button key={l.label} onClick={() => setGasLimit(l.value)} className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${gasLimit === l.value ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}>{l.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost summary */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <p className="text-sm font-semibold">Estimated Transaction Cost</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground text-xs">Max Fee Per Gas</p><p className="font-semibold font-mono">{maxFeeGwei.toFixed(1)} Gwei</p></div>
          <div><p className="text-muted-foreground text-xs">Gas Limit</p><p className="font-semibold font-mono">{gasLimit.toLocaleString()}</p></div>
          <div><p className="text-muted-foreground text-xs">Max Gas Cost</p><p className="font-semibold">{gasCostEth.toFixed(6)} ETH</p></div>
          <div><p className="text-muted-foreground text-xs">USD Estimate</p><p className="font-bold text-lg">${gasCostUsd.toFixed(2)}</p></div>
        </div>
        {gasCostUsd > 20 && (
          <div className="flex items-center gap-2 text-xs text-yellow-500 mt-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            High gas cost. Consider waiting for lower network activity.
          </div>
        )}
      </div>
    </div>
  );
}