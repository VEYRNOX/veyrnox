import { useState } from "react";
import { CreditCard, ExternalLink, DollarSign, Shield, Zap, Globe, ChevronRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TOP_SYMBOLS } from "@/lib/cryptos";

const PROVIDERS = [
  {
    id: "moonpay",
    name: "MoonPay",
    logo: "🌙",
    fees: "1.5% - 4.5%",
    methods: ["Visa", "Mastercard", "Apple Pay", "Bank Transfer"],
    limits: "$30 - $20,000/mo",
    kyc: "Tier 1: ID scan",
    speed: "Instant (card)",
    supported: ["ETH", "BTC", "SOL", "USDC", "XRP"],
    color: "#7B5EA7",
    buildUrl: (currency, address, amount) =>
      `https://buy.moonpay.com?apiKey=pk_live_YOUR_KEY&currencyCode=${currency.toLowerCase()}&walletAddress=${address}&baseCurrencyAmount=${amount}&colorCode=%237B5EA7`,
  },
  {
    id: "transak",
    name: "Transak",
    logo: "⚡",
    fees: "0.99% - 5.5%",
    methods: ["Visa", "Mastercard", "Bank Transfer", "Google Pay"],
    limits: "$30 - $50,000/mo",
    kyc: "KYC via Sumsub",
    speed: "5-10 min (bank)",
    supported: ["ETH", "BTC", "SOL", "USDC", "BNB", "DOGE", "ADA"],
    color: "#1F5EFF",
    buildUrl: (currency, address, amount) =>
      `https://global.transak.com?apiKey=YOUR_KEY&cryptoCurrencyCode=${currency}&walletAddress=${address}&fiatAmount=${amount}&fiatCurrency=USD`,
  },
  {
    id: "ramp",
    name: "Ramp Network",
    logo: "🔥",
    fees: "0.49% - 2.9%",
    methods: ["Visa", "Mastercard", "Open Banking", "Apple Pay"],
    limits: "$500/day",
    kyc: "Automated KYC",
    speed: "Instant - 2 hrs",
    supported: ["ETH", "BTC", "USDC", "USDT", "TRX"],
    color: "#00B259",
    buildUrl: (currency, address, amount) =>
      `https://buy.ramp.network?swapAsset=ETH_${currency}&userAddress=${address}&swapAmount=${parseFloat(amount) * 1e18}`,
  },
  {
    id: "onramper",
    name: "Onramper",
    logo: "🚀",
    fees: "Best rate aggregated",
    methods: ["All major methods"],
    limits: "Varies by provider",
    kyc: "Provider-dependent",
    speed: "Instant - 24 hrs",
    supported: ["ETH", "BTC", "SOL", "USDC", "100+ more"],
    color: "#FF6B35",
    buildUrl: (currency, address, amount) =>
      `https://widget.onramper.com?color=FF6B35&defaultCrypto=${currency}&wallets=${currency}:${address}&isAddressEditable=false`,
  },
];

const TOKENS = TOP_SYMBOLS;

export default function LiveFiatRamp() {
  const [selectedProvider, setSelectedProvider] = useState("moonpay");
  const [currency, setCurrency] = useState("ETH");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("100");
  const [launched, setLaunched] = useState(false);

  const provider = PROVIDERS.find(p => p.id === selectedProvider);

  const launch = () => {
    const url = provider.buildUrl(currency, address, amount);
    window.open(url, "_blank", "width=460,height=700,scrollbars=yes");
    setLaunched(true);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Live Fiat On-Ramp</h1>
        <p className="text-sm text-muted-foreground">Buy crypto with card, Apple Pay, or bank transfer — real integrations</p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => setSelectedProvider(p.id)}
            className={`p-3 rounded-xl border text-left transition-all ${selectedProvider === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{p.logo}</span>
              <span className="font-semibold text-sm">{p.name}</span>
              {selectedProvider === p.id && <CheckCircle className="h-3.5 w-3.5 text-primary ml-auto" />}
            </div>
            <p className="text-[10px] text-muted-foreground">Fees: {p.fees}</p>
            <p className="text-[10px] text-muted-foreground">{p.speed}</p>
          </button>
        ))}
      </div>

      {/* Provider details */}
      {provider && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold flex items-center gap-2"><span className="text-xl">{provider.logo}</span>{provider.name}</p>
            <span className="text-xs px-2 py-1 rounded-full border border-green-500/30 bg-green-500/5 text-green-500 font-semibold">Live Integration</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-muted-foreground">Fees</p><p className="font-semibold">{provider.fees}</p></div>
            <div><p className="text-muted-foreground">Limits</p><p className="font-semibold">{provider.limits}</p></div>
            <div><p className="text-muted-foreground">KYC Required</p><p className="font-semibold">{provider.kyc}</p></div>
            <div><p className="text-muted-foreground">Speed</p><p className="font-semibold">{provider.speed}</p></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Payment Methods</p>
            <div className="flex flex-wrap gap-1">
              {provider.methods.map(m => <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{m}</span>)}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Supported Tokens</p>
            <div className="flex flex-wrap gap-1">
              {provider.supported.map(s => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{s}</span>)}
            </div>
          </div>
        </div>
      )}

      {/* Purchase form */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount (USD)</Label><Input type="number" className="mt-1.5" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100" /></div>
          <div><Label>Receive</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{TOKENS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Destination Wallet Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x... your wallet address" value={address} onChange={e => setAddress(e.target.value)} /></div>

        <Button className="w-full gap-2 h-12 text-base" onClick={launch} disabled={!address || !amount}>
          <ExternalLink className="h-5 w-5" /> Buy ${amount} of {currency} via {provider?.name}
        </Button>
      </div>

      {launched && (
        <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5 text-xs text-green-500 flex items-start gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{provider?.name} widget opened in a new window. Complete KYC and payment there. Your crypto will be sent to the provided address.</span>
        </div>
      )}

      <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
        <p className="font-semibold mb-1 flex items-center gap-1"><Shield className="h-3 w-3" /> About these integrations</p>
        <p>These are real on-ramp providers. Clicking "Buy" opens their hosted KYC + payment widget. Your wallet address is pre-filled. You will need to complete identity verification as required by each provider.</p>
      </div>
    </div>
  );
}