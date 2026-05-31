import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowDownUp, RefreshCw, Zap, AlertTriangle, CheckCircle2, Settings2, TrendingUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";

// Top 10 by market cap, from the canonical source.
const TOKENS = TOP_CRYPTOS.map(c => ({
  symbol: c.symbol, name: c.name, price: c.usd, color: c.color, icon: c.glyph,
}));

const PROTOCOLS = [
  { name: "Uniswap v3", fee: 0.3, liquidity: "High", icon: "🦄" },
  { name: "Curve", fee: 0.04, liquidity: "High", icon: "🌀" },
  { name: "1inch", fee: 0.1, liquidity: "Best Route", icon: "⚡" },
  { name: "Balancer", fee: 0.2, liquidity: "Medium", icon: "⚖️" },
];

export default function DEXSwap() {
  const queryClient = useQueryClient();
  const [fromToken, setFromToken] = useState("ETH");
  const [toToken, setToToken] = useState("USDC");
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState(PROTOCOLS[2]);
  const [step, setStep] = useState("input"); // input | confirm | done

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const fromTokenData = TOKENS.find(t => t.symbol === fromToken);
  const toTokenData = TOKENS.find(t => t.symbol === toToken);
  const fromWallet = wallets.find(w => w.currency === fromToken);
  const toWallet = wallets.find(w => w.currency === toToken);

  const exchangeRate = toTokenData && fromTokenData ? fromTokenData.price / toTokenData.price : 0;
  const toAmount = fromAmount ? (parseFloat(fromAmount) * exchangeRate).toFixed(6) : "";
  const priceImpact = fromAmount ? Math.min(parseFloat(fromAmount) * fromTokenData?.price / 1000000 * 100, 5).toFixed(2) : "0.00";
  const gasFee = selectedProtocol ? (selectedProtocol.fee * (parseFloat(fromAmount) || 0) / 100) : 0;
  const minReceived = toAmount ? (parseFloat(toAmount) * (1 - slippage / 100)).toFixed(6) : "";

  const executeSwap = useMutation({
    mutationFn: async () => {
      if (!fromWallet) throw new Error("Source wallet not found");
      if (fromWallet.balance < parseFloat(fromAmount)) throw new Error("Insufficient balance");
      const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      await base44.entities.Transaction.create({ wallet_id: fromWallet.id, type: "swap", amount: parseFloat(fromAmount), currency: fromToken, to_address: toWallet?.address || "DEX_CONTRACT", status: "confirmed", tx_hash: txHash, note: `DEX Swap: ${fromAmount} ${fromToken} → ${toAmount} ${toToken} via ${selectedProtocol.name}` });
      await base44.entities.Wallet.update(fromWallet.id, { balance: fromWallet.balance - parseFloat(fromAmount) });
      if (toWallet) await base44.entities.Wallet.update(toWallet.id, { balance: toWallet.balance + parseFloat(toAmount) });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["wallets"] }); setStep("done"); },
    onError: (e) => toast.error(e.message),
  });

  const flipTokens = () => { setFromToken(toToken); setToToken(fromToken); setFromAmount(""); };

  if (step === "done") return (
    <div className="max-w-md mx-auto text-center py-16 space-y-4">
      <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto"><CheckCircle2 className="h-8 w-8 text-green-400" /></div>
      <h2 className="text-xl font-bold">Swap Complete!</h2>
      <p className="text-sm text-muted-foreground">Swapped {fromAmount} {fromToken} → {toAmount} {toToken}</p>
      <p className="text-xs text-muted-foreground">via {selectedProtocol.name}</p>
      <Button variant="outline" onClick={() => { setStep("input"); setFromAmount(""); }}>Swap Again</Button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ArrowDownUp className="h-6 w-6 text-primary" /> DEX Swap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Swap tokens via decentralised protocols</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => setShowSettings(!showSettings)}><Settings2 className="h-4 w-4" /></Button>
      </div>

      {/* Slippage settings */}
      {showSettings && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <p className="text-sm font-semibold">Slippage Tolerance: {slippage}%</p>
          <Slider min={0.1} max={5} step={0.1} value={[slippage]} onValueChange={([v]) => setSlippage(v)} />
          <div className="flex gap-2">{[0.1, 0.5, 1, 3].map(v => <Button key={v} variant={slippage === v ? "default" : "outline"} size="sm" className="flex-1 text-xs h-7" onClick={() => setSlippage(v)}>{v}%</Button>)}</div>
        </div>
      )}

      {/* Protocol selector */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Protocol</p>
        <div className="grid grid-cols-2 gap-2">
          {PROTOCOLS.map(p => (
            <button key={p.name} onClick={() => setSelectedProtocol(p)} className={`p-2.5 rounded-xl border text-left transition-colors ${selectedProtocol.name === p.name ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{p.icon}</span>
                <div>
                  <p className="text-xs font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.fee}% fee · {p.liquidity}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Swap form */}
      {step === "input" && (
        <div className="space-y-2">
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">From</Label>
              {fromWallet && <span className="text-xs text-muted-foreground">Balance: {fromWallet.balance} {fromToken}</span>}
            </div>
            <div className="flex gap-2">
              <Input type="number" value={fromAmount} onChange={e => setFromAmount(e.target.value)} placeholder="0.00" className="text-lg font-bold flex-1" />
              <Select value={fromToken} onValueChange={v => { if (v === toToken) setToToken(fromToken); setFromToken(v); }}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{TOKENS.map(t => <SelectItem key={t.symbol} value={t.symbol}><span className="inline-flex items-center gap-1.5"><CoinLogo symbol={t.symbol} size={16} />{t.symbol}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            {fromAmount && <p className="text-xs text-muted-foreground">≈ ${(parseFloat(fromAmount) * fromTokenData?.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>}
          </div>

          <div className="flex justify-center">
            <Button variant="outline" size="icon" className="rounded-full h-8 w-8" onClick={flipTokens}><ArrowDownUp className="h-3.5 w-3.5" /></Button>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">To</Label>
              {toWallet && <span className="text-xs text-muted-foreground">Balance: {toWallet.balance} {toToken}</span>}
            </div>
            <div className="flex gap-2">
              <Input value={toAmount} readOnly placeholder="0.00" className="text-lg font-bold flex-1 bg-secondary" />
              <Select value={toToken} onValueChange={v => { if (v === fromToken) setFromToken(toToken); setToToken(v); }}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{TOKENS.map(t => <SelectItem key={t.symbol} value={t.symbol}><span className="inline-flex items-center gap-1.5"><CoinLogo symbol={t.symbol} size={16} />{t.symbol}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {fromAmount && toAmount && (
            <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 {fromToken} = {exchangeRate.toFixed(6)} {toToken}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price Impact</span><span className={parseFloat(priceImpact) > 2 ? "text-destructive" : "text-green-400"}>{priceImpact}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Protocol Fee</span><span>{selectedProtocol.fee}% ≈ {gasFee.toFixed(6)} {fromToken}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Min Received</span><span className="font-mono">{minReceived} {toToken}</span></div>
            </div>
          )}

          {parseFloat(priceImpact) > 2 && fromAmount && (
            <div className="flex gap-2 items-start p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <span className="text-destructive">High price impact ({priceImpact}%). Consider splitting into smaller swaps.</span>
            </div>
          )}

          <Button className="w-full gap-2" disabled={!fromAmount || !toAmount || !fromWallet} onClick={() => setStep("confirm")}>
            <Zap className="h-4 w-4" /> Preview Swap
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest text-center">Confirm Swap</p>
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold">{fromAmount}</p>
                <p className="text-sm text-muted-foreground">{fromToken}</p>
              </div>
              <ArrowDownUp className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold">{toAmount}</p>
                <p className="text-sm text-muted-foreground">{toToken}</p>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground">via {selectedProtocol.icon} {selectedProtocol.name} · slippage {slippage}%</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("input")}>Back</Button>
            <Button className="flex-1" onClick={() => executeSwap.mutate()} disabled={executeSwap.isPending}>
              {executeSwap.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Confirm Swap"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}