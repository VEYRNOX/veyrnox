import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, CreditCard, Building2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PROVIDERS = [
  { name: "MoonPay", desc: "Credit/debit card, bank transfer", icon: "🌙", fee: "~4.5%", buyUrl: "https://buy.moonpay.com", sellUrl: "https://sell.moonpay.com" },
  { name: "Transak", desc: "200+ countries, 100+ currencies", icon: "⚡", fee: "~0.99%", buyUrl: "https://global.transak.com", sellUrl: "https://global.transak.com" },
  { name: "Ramp", desc: "Bank transfer & Open Banking", icon: "🔄", fee: "~0.49%", buyUrl: "https://ramp.network", sellUrl: "https://ramp.network" },
  { name: "Coinbase Pay", desc: "Instant with Coinbase account", icon: "🔵", fee: "~1.49%", buyUrl: "https://pay.coinbase.com", sellUrl: "https://pay.coinbase.com" },
];

const FIATS = ["USD", "EUR", "GBP", "AUD", "CAD"];
const CRYPTOS = ["BTC", "ETH", "SOL", "USDC", "USDT"];
const RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

export default function FiatRamp() {
  const [tab, setTab] = useState("buy");
  const [fiatAmount, setFiatAmount] = useState("");
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [cryptoCurrency, setCryptoCurrency] = useState("ETH");

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const rate = RATES[cryptoCurrency] || 1;
  const cryptoAmount = fiatAmount ? (parseFloat(fiatAmount) / rate).toFixed(6) : "";
  const isBuy = tab === "buy";

  const buildUrl = (provider) => {
    const base = isBuy ? provider.buyUrl : provider.sellUrl;
    const params = new URLSearchParams({
      defaultCurrencyCode: cryptoCurrency,
      baseCurrencyCode: fiatCurrency,
      ...(fiatAmount && { baseCurrencyAmount: fiatAmount }),
      ...(wallets.find(w => w.currency === cryptoCurrency)?.address && { walletAddress: wallets.find(w => w.currency === cryptoCurrency)?.address }),
    });
    return `${base}?${params.toString()}`;
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fiat On/Off Ramp</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Buy or sell crypto with traditional currency</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="buy" className="flex-1 gap-2"><ArrowDownToLine className="h-4 w-4" /> Buy Crypto</TabsTrigger>
          <TabsTrigger value="sell" className="flex-1 gap-2"><ArrowUpFromLine className="h-4 w-4" /> Sell Crypto</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {/* Quote calculator */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Estimate</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{isBuy ? "You Pay" : "You Receive"} ({fiatCurrency})</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input type="number" value={fiatAmount} onChange={e => setFiatAmount(e.target.value)} placeholder="100" className="flex-1" />
                  <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{isBuy ? "You Receive" : "You Send"} (Crypto)</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input value={cryptoAmount} readOnly placeholder="0.00000" className="flex-1 bg-secondary" />
                  <Select value={cryptoCurrency} onValueChange={setCryptoCurrency}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{CRYPTOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-3">
              <span>1 {cryptoCurrency}</span>
              <span>≈ {fiatCurrency} {rate.toLocaleString()}</span>
            </div>
            {isBuy && wallets.find(w => w.currency === cryptoCurrency) && (
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Destination wallet</span>
                <span className="font-mono truncate max-w-[200px]">{wallets.find(w => w.currency === cryptoCurrency)?.address}</span>
              </div>
            )}
          </div>

          {/* Providers */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Choose Provider</p>
            {PROVIDERS.map(p => (
              <div key={p.name} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">{p.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <span className="text-xs text-muted-foreground">Fee {p.fee}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                    <div className="flex gap-2 mt-2">
                      {[{ icon: CreditCard, label: "Card" }, { icon: Building2, label: "Bank" }, { icon: Smartphone, label: "Wallet" }].map(m => (
                        <span key={m.label} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                          <m.icon className="h-2.5 w-2.5" /> {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => window.open(buildUrl(p), "_blank")}>
                    {isBuy ? "Buy" : "Sell"} <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-center text-muted-foreground">Rates are indicative. Actual rates shown at provider checkout. Fees vary by payment method and region.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}