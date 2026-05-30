import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownUp, Loader2, CheckCircle2, RefreshCw, ChevronRight, AlertTriangle, Fuel, Zap, Settings2, Info } from "lucide-react";
import { toast } from "sonner";

const USD_RATES    = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const CHAIN        = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", USDC: "Ethereum", USDT: "Ethereum" };
const CURRENCY_SYMBOLS = { BTC: "₿", ETH: "Ξ", SOL: "◎", USDC: "$", USDT: "₮" };
const CURRENCY_COLORS  = { BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", USDC: "#2775CA", USDT: "#26A17B" };
const FEE_RATE = 0.005;

// Simulated gas costs (USD) per chain pair
const GAS_COSTS = {
  "Ethereum-Ethereum": 4.20,
  "Bitcoin-Ethereum":  18.50,
  "Ethereum-Bitcoin":  18.50,
  "Solana-Ethereum":   12.80,
  "Ethereum-Solana":   12.80,
  "Solana-Solana":     0.02,
  "Bitcoin-Bitcoin":   5.00,
  "Bitcoin-Solana":    21.00,
  "Solana-Bitcoin":    21.00,
  "Ethereum-Solana":   12.80,
};

// Cross-chain route steps
function getRoute(from, to) {
  if (!from || !to || from === to) return [from, to].filter(Boolean);
  const fc = CHAIN[from], tc = CHAIN[to];
  if (fc === tc) return [from, to];
  if (fc === "Bitcoin" || tc === "Bitcoin") return [from, "Bridge", "DEX", to];
  return [from, "Bridge", to];
}

function gasKey(from, to) {
  const a = CHAIN[from] || "Ethereum", b = CHAIN[to] || "Ethereum";
  return `${a}-${b}`;
}

function getRate(from, to) {
  if (!USD_RATES[from] || !USD_RATES[to]) return 0;
  return USD_RATES[from] / USD_RATES[to];
}

function CurrencyIcon({ currency, size = "sm" }) {
  const sz = size === "lg" ? "h-10 w-10 text-xl" : "h-7 w-7 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: (CURRENCY_COLORS[currency] || "#888") + "20", color: CURRENCY_COLORS[currency] || "#888" }}>
      {CURRENCY_SYMBOLS[currency] || "●"}
    </div>
  );
}

const SLIPPAGE_PRESETS = ["0.1", "0.5", "1.0"];

export default function Swap() {
  const queryClient = useQueryClient();
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId]     = useState("");
  const [fromAmount, setFromAmount]     = useState("");
  const [slippage, setSlippage]         = useState("0.5");
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [step, setStep] = useState("input"); // "input" | "confirm" | "done"
  const [quoteLoading, setQuoteLoading] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const fromWallet = wallets.find(w => w.id === fromWalletId);
  const toWallet   = wallets.find(w => w.id === toWalletId);

  const effectiveSlippage = parseFloat(customSlippage || slippage) || 0.5;
  const rate       = fromWallet && toWallet ? getRate(fromWallet.currency, toWallet.currency) : 0;
  const parsedFrom = parseFloat(fromAmount) || 0;
  const fee        = parsedFrom * FEE_RATE;
  const toAmount   = (parsedFrom - fee) * rate;
  const minReceived = toAmount * (1 - effectiveSlippage / 100);
  const gasCostUSD = fromWallet && toWallet
    ? (GAS_COSTS[gasKey(fromWallet.currency, toWallet.currency)] || 2.50)
    : 0;
  const priceImpact = parsedFrom > 0 && fromWallet
    ? Math.min(((parsedFrom * USD_RATES[fromWallet.currency]) / 500000) * 100, 15)
    : 0;
  const isCrossChain = fromWallet && toWallet && CHAIN[fromWallet.currency] !== CHAIN[toWallet.currency];
  const route = fromWallet && toWallet ? getRoute(fromWallet.currency, toWallet.currency) : [];

  // Simulate a quote refresh
  const [quoteAge, setQuoteAge] = useState(0);
  useEffect(() => {
    if (step !== "confirm") return;
    setQuoteAge(0);
    const timer = setInterval(() => setQuoteAge(a => a + 1), 1000);
    return () => clearInterval(timer);
  }, [step, fromWalletId, toWalletId, fromAmount]);

  const fetchQuote = () => {
    setQuoteLoading(true);
    setTimeout(() => { setQuoteLoading(false); setStep("confirm"); }, 900);
  };

  const swapMutation = useMutation({
    mutationFn: async () => {
      const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      await Promise.all([
        base44.entities.Wallet.update(fromWalletId, { balance: Math.max(0, (fromWallet.balance || 0) - parsedFrom) }),
        base44.entities.Wallet.update(toWalletId, { balance: (toWallet.balance || 0) + toAmount }),
      ]);
      await base44.entities.Transaction.create({
        wallet_id: fromWalletId,
        type: "swap",
        amount: parsedFrom,
        currency: fromWallet.currency,
        to_address: toWallet.address,
        from_address: fromWallet.address,
        status: "confirmed",
        tx_hash: txHash,
        note: `Swapped ${parsedFrom} ${fromWallet.currency} → ${toAmount.toFixed(6)} ${toWallet.currency}`,
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["wallets"] });
      const prevWallets = queryClient.getQueryData(["wallets"]);
      queryClient.setQueryData(["wallets"], (old) =>
        old?.map(w => {
          if (w.id === fromWalletId) return { ...w, balance: Math.max(0, (w.balance || 0) - parsedFrom) };
          if (w.id === toWalletId) return { ...w, balance: (w.balance || 0) + toAmount };
          return w;
        }) ?? []
      );
      return { prevWallets };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevWallets) queryClient.setQueryData(["wallets"], ctx.prevWallets);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setStep("done");
    },
    onError: () => toast.error("Swap failed"),
  });

  const flip = () => {
    const tmp = fromWalletId;
    setFromWalletId(toWalletId);
    setToWalletId(tmp);
    setFromAmount("");
    setStep("input");
  };

  const canGetQuote =
    fromWalletId && toWalletId && fromWalletId !== toWalletId &&
    parsedFrom > 0 && parsedFrom <= (fromWallet?.balance || 0) && toWallet;

  // ─── Done screen ───
  if (step === "done") {
    return (
      <div className="max-w-sm mx-auto text-center py-16 space-y-4">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold">Swap Complete</h2>
        <p className="text-sm text-muted-foreground">
          {parsedFrom} {fromWallet?.currency} → {toAmount.toFixed(6)} {toWallet?.currency}
        </p>
        <Button variant="outline" onClick={() => { setStep("input"); setFromAmount(""); }}>
          <RefreshCw className="h-4 w-4 mr-2" />New Swap
        </Button>
      </div>
    );
  }

  // ─── Confirm screen ───
  if (step === "confirm") {
    return (
      <div className="max-w-sm mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("input")} className="text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
          <h1 className="text-xl font-bold">Confirm Swap</h1>
          {quoteAge < 30 ? (
            <span className="ml-auto text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              Quote live · {30 - quoteAge}s
            </span>
          ) : (
            <button
              onClick={() => setQuoteAge(0)}
              className="ml-auto text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full flex items-center gap-1"
            >
              <RefreshCw className="h-2.5 w-2.5" /> Refresh
            </button>
          )}
        </div>

        {/* Swap summary card */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurrencyIcon currency={fromWallet.currency} size="lg" />
              <div>
                <p className="text-lg font-bold">{parsedFrom} {fromWallet.currency}</p>
                <p className="text-xs text-muted-foreground">{fromWallet.name}</p>
              </div>
            </div>
            <ArrowDownUp className="h-5 w-5 text-muted-foreground mx-2" />
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-lg font-bold">{toAmount.toFixed(6)} {toWallet.currency}</p>
                <p className="text-xs text-muted-foreground">{toWallet.name}</p>
              </div>
              <CurrencyIcon currency={toWallet.currency} size="lg" />
            </div>
          </div>

          {/* Route */}
          {route.length > 2 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest mr-1">Route</span>
              {route.map((step, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    step === "Bridge" ? "bg-primary/15 text-primary" :
                    step === "DEX"    ? "bg-purple-500/15 text-purple-400" :
                    "bg-secondary text-foreground"
                  }`}>{step}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Details breakdown */}
        <div className="rounded-2xl border border-border bg-card p-4 text-sm space-y-3">
          <Row label="Exchange Rate"        value={`1 ${fromWallet.currency} = ${rate.toFixed(6)} ${toWallet.currency}`} />
          <Row label="Protocol Fee (0.5%)"  value={`${fee.toFixed(6)} ${fromWallet.currency}`} />
          <Row label={`Min. Received (${effectiveSlippage}% slippage)`}
               value={`${minReceived.toFixed(6)} ${toWallet.currency}`} bold />
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Fuel className="h-3.5 w-3.5" />
                <span>Estimated Gas</span>
              </div>
              <span className={`font-medium ${gasCostUSD > 10 ? "text-yellow-400" : "text-foreground"}`}>
                ~${gasCostUSD.toFixed(2)}
              </span>
            </div>
            {isCrossChain && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Network</span>
                </div>
                <span className="font-medium text-primary">Cross-chain</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                <span>Price Impact</span>
              </div>
              <span className={`font-medium ${priceImpact > 3 ? "text-destructive" : priceImpact > 1 ? "text-yellow-400" : "text-green-400"}`}>
                {priceImpact < 0.01 ? "< 0.01" : priceImpact.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {priceImpact > 3 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>High price impact ({priceImpact.toFixed(1)}%). You may receive significantly less than expected.</p>
          </div>
        )}
        {gasCostUSD > 10 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
            <Fuel className="h-4 w-4 shrink-0 mt-0.5" />
            <p>High gas fees (~${gasCostUSD.toFixed(2)}) due to cross-chain bridging. Consider waiting for lower network activity.</p>
          </div>
        )}
        {effectiveSlippage > 1 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>High slippage tolerance ({effectiveSlippage}%). Your trade may execute at an unfavourable price.</p>
          </div>
        )}

        <Button
          className="w-full h-12 text-base"
          disabled={swapMutation.isPending}
          onClick={() => swapMutation.mutate()}
        >
          {swapMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Swapping...</>
            : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirm Swap</>}
        </Button>
      </div>
    );
  }

  // ─── Input screen ───
  return (
    <div className="max-w-sm mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cross-chain swaps via aggregator</p>
        </div>
        <button
          onClick={() => setShowSlippageSettings(s => !s)}
          className={`mt-1 p-2 rounded-lg transition-colors ${showSlippageSettings ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Slippage Settings */}
      {showSlippageSettings && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Slippage Tolerance</p>
          <div className="flex gap-2">
            {SLIPPAGE_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setSlippage(p); setCustomSlippage(""); }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  slippage === p && !customSlippage
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {p}%
              </button>
            ))}
            <Input
              type="number"
              placeholder="Custom"
              value={customSlippage}
              onChange={e => { setCustomSlippage(e.target.value); setSlippage(""); }}
              className="flex-1 h-9 text-sm text-center"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Your transaction will revert if price moves more than {effectiveSlippage}% unfavourably.
          </p>
        </div>
      )}

      <div className="relative space-y-2">
        {/* From */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-widest">From</Label>
            {fromWallet && (
              <button className="text-xs text-primary hover:underline" onClick={() => setFromAmount(String(fromWallet.balance))}>
                Max: {fromWallet.balance} {fromWallet.currency}
              </button>
            )}
          </div>
          <Select value={fromWalletId} onValueChange={v => { setFromWalletId(v); setFromAmount(""); setStep("input"); }}>
            <SelectTrigger className="border-0 bg-secondary h-auto p-0 focus:ring-0">
              <SelectValue placeholder="Select wallet">
                {fromWallet && (
                  <div className="flex items-center gap-2 py-1">
                    <CurrencyIcon currency={fromWallet.currency} />
                    <div>
                      <p className="font-semibold text-sm">{fromWallet.currency}</p>
                      <p className="text-xs text-muted-foreground">{CHAIN[fromWallet.currency]} · {fromWallet.name}</p>
                    </div>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {wallets.map(w => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex items-center gap-2">
                    <CurrencyIcon currency={w.currency} />
                    <span>{w.name} — {w.balance} {w.currency} <span className="text-muted-foreground">({CHAIN[w.currency]})</span></span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={fromAmount}
            onChange={e => setFromAmount(e.target.value)}
            placeholder="0.00"
            className="text-xl font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />
          {fromWallet && parsedFrom > 0 && (
            <p className="text-xs text-muted-foreground">
              ≈ ${(parsedFrom * (USD_RATES[fromWallet.currency] || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Flip */}
        <div className="flex justify-center">
          <button
            onClick={flip}
            className="h-9 w-9 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/40 hover:bg-primary/10 transition-all"
          >
            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* To */}
        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-widest">To (estimated)</Label>
          <Select value={toWalletId} onValueChange={v => { setToWalletId(v); setStep("input"); }}>
            <SelectTrigger className="border-0 bg-secondary h-auto p-0 focus:ring-0">
              <SelectValue placeholder="Select wallet">
                {toWallet && (
                  <div className="flex items-center gap-2 py-1">
                    <CurrencyIcon currency={toWallet.currency} />
                    <div>
                      <p className="font-semibold text-sm">{toWallet.currency}</p>
                      <p className="text-xs text-muted-foreground">{CHAIN[toWallet.currency]} · {toWallet.name}</p>
                    </div>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {wallets.filter(w => w.id !== fromWalletId).map(w => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex items-center gap-2">
                    <CurrencyIcon currency={w.currency} />
                    <span>{w.name} — {w.balance} {w.currency} <span className="text-muted-foreground">({CHAIN[w.currency]})</span></span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={`text-xl font-bold ${toAmount > 0 ? "" : "text-muted-foreground/40"}`}>
            {toAmount > 0 ? toAmount.toFixed(6) : "0.00"}
          </p>
          {toWallet && toAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              ≈ ${(toAmount * (USD_RATES[toWallet.currency] || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>

      {/* Quick info bar */}
      {fromWallet && toWallet && fromWalletId !== toWalletId && parsedFrom > 0 && (
        <div className="p-3 rounded-xl bg-secondary text-xs space-y-2 text-muted-foreground">
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="text-foreground font-medium">1 {fromWallet.currency} = {rate.toFixed(6)} {toWallet.currency}</span>
          </div>
          <div className="flex justify-between">
            <div className="flex items-center gap-1"><Fuel className="h-3 w-3" /> Est. Gas</div>
            <span className={gasCostUSD > 10 ? "text-yellow-400 font-medium" : ""}>~${gasCostUSD.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Slippage</span>
            <span>{effectiveSlippage}%</span>
          </div>
          {isCrossChain && (
            <div className="flex items-center gap-1 text-primary pt-0.5">
              <Zap className="h-3 w-3" />
              <span>Cross-chain swap · via bridge aggregator</span>
            </div>
          )}
        </div>
      )}

      <Button
        className="w-full h-12 text-base"
        disabled={!canGetQuote || quoteLoading}
        onClick={fetchQuote}
      >
        {quoteLoading
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Fetching Quote...</>
          : <><Zap className="h-4 w-4 mr-2" />Get Quote</>}
      </Button>

      {fromWallet && parsedFrom > (fromWallet.balance || 0) && (
        <p className="text-xs text-destructive text-center">Insufficient balance</p>
      )}
      {fromWalletId && toWalletId && fromWalletId === toWalletId && (
        <p className="text-xs text-destructive text-center">Cannot swap to the same wallet</p>
      )}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}