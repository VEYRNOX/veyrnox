import { useState } from "react";
import { ArrowDownToLine, Copy, CheckCircle, ChevronRight, ExternalLink, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const EXCHANGES = [
  { id: "binance", name: "Binance", logo: "🟡", color: "#F3BA2F", steps: ["Open Binance app or website", "Go to Wallet → Fiat and Spot", "Click [Withdraw]", "Select coin and network", "Paste your SafeDigitalWallet address", "Confirm via email/2FA"] },
  { id: "coinbase", name: "Coinbase", logo: "🔵", color: "#0052FF", steps: ["Open Coinbase app or website", "Tap [Send & Receive] → Send", "Choose your asset", "Paste your SafeDigitalWallet address", "Enter amount and confirm", "Verify with Face ID / 2FA"] },
  { id: "kraken", name: "Kraken", logo: "🟣", color: "#5741D9", steps: ["Log into Kraken", "Go to Funding → Withdraw", "Select your asset and network", "Add SafeDigitalWallet as a new address", "Enter amount and confirm", "Approve via email confirmation"] },
  { id: "okx", name: "OKX", logo: "⚫", color: "#000000", steps: ["Open OKX app", "Go to Assets → Withdraw", "Select asset and on-chain withdrawal", "Paste your wallet address", "Set network (match your wallet network)", "Confirm with security verification"] },
  { id: "bybit", name: "Bybit", logo: "🟠", color: "#F7A600", steps: ["Log into Bybit", "Click Assets → Withdraw", "Choose coin and network", "Enter your SafeDigitalWallet address", "Set amount and submit", "Complete Google Auth / SMS verification"] },
];

const NETWORK_TIPS = {
  ETH: "Always select the Ethereum (ERC-20) network unless you have a specific L2 wallet.",
  BTC: "Use the Bitcoin network. Avoid sending BTC to ERC-20 addresses.",
  BNB: "Select BNB Smart Chain (BSC/BEP20) for BNB tokens.",
  SOL: "Select Solana network. Do not use BSC for Solana withdrawals.",
};

export default function CEXDeposit() {
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const wallet = wallets[0];

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <ArrowDownToLine className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Deposit from Exchange</h1>
          <p className="text-sm text-muted-foreground">Step-by-step guide to withdraw from any CEX to your wallet</p>
        </div>
      </div>

      {/* Your wallet address */}
      {wallet ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Your SafeDigitalWallet Address</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono flex-1 truncate text-foreground">{wallet.address || "0x" + "a1b2c3d4e5f6".repeat(3).slice(0, 40)}</code>
              <button onClick={() => copy(wallet.address || "")} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                {copiedAddr ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{wallet.name} · {wallet.currency}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 text-sm text-amber-400">Create a wallet first to get your deposit address.</CardContent>
        </Card>
      )}

      {/* Exchange selector */}
      <div>
        <p className="text-sm font-semibold mb-2">Choose your exchange</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {EXCHANGES.map(ex => (
            <button key={ex.id} onClick={() => setSelectedExchange(selectedExchange?.id === ex.id ? null : ex)}
              className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-colors ${selectedExchange?.id === ex.id ? "border-primary/50 bg-primary/5 text-foreground" : "border-border hover:bg-secondary/50 text-muted-foreground"}`}>
              <span className="text-lg">{ex.logo}</span>{ex.name}
            </button>
          ))}
        </div>
      </div>

      {/* Step-by-step guide */}
      {selectedExchange && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-xl">{selectedExchange.logo}</span> {selectedExchange.name} Withdrawal Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedExchange.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                <p className="text-sm pt-0.5">{step}</p>
              </div>
            ))}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Always double-check the network matches your wallet
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Network tips */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">⚠ Network Selection Tips</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(NETWORK_TIPS).map(([coin, tip]) => (
            <div key={coin} className="flex items-start gap-2 text-xs">
              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{coin}</Badge>
              <span className="text-muted-foreground">{tip}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Common mistakes */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">Common Mistakes to Avoid</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {["Sending to the wrong network (e.g., ERC-20 address on BSC)", "Copying only part of the address", "Forgetting to whitelist the address on high-security accounts", "Sending a test transaction first (always recommended!)"].map(m => (
            <div key={m} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="text-destructive shrink-0">✕</span>{m}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}