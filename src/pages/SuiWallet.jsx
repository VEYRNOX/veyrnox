import { useState } from "react";
import { Hexagon, Send, Download, RefreshCw, CheckCircle, Copy, ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const SUI_TOKENS = [
  { symbol: "SUI", name: "Sui", balance: "42.5", usd: 4.82, change: 5.3 },
  { symbol: "USDC", name: "USD Coin (Sui)", balance: "250.00", usd: 1.0, change: 0 },
  { symbol: "CETUS", name: "Cetus Protocol", balance: "1200", usd: 0.045, change: -2.1 },
  { symbol: "TURBOS", name: "Turbos Finance", balance: "5000", usd: 0.009, change: 8.4 },
];

const VALIDATORS = [
  { name: "Mysten Labs", apy: 4.1, commission: 0, stake: "120M SUI", status: "active" },
  { name: "Jump Crypto", apy: 4.0, commission: 2, stake: "85M SUI", status: "active" },
  { name: "Figment", apy: 3.9, commission: 5, stake: "67M SUI", status: "active" },
  { name: "P2P Validator", apy: 3.8, commission: 5, stake: "42M SUI", status: "active" },
];

const RECENT_TXS = [
  { digest: "HeLo4x...9Ac2B", type: "Coin Transfer", amount: "5 SUI", status: "success", age: "2m" },
  { digest: "ABcd8j...3Rx1K", type: "Stake Delegation", amount: "10 SUI", status: "success", age: "1h" },
  { digest: "Zq9fXy...7Wt5N", type: "Object Transfer", amount: "—", status: "success", age: "3h" },
];

export default function SuiWallet() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("portfolio");
  const [staking, setStaking] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const suiAddress = "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const totalUsd = SUI_TOKENS.reduce((sum, t) => sum + parseFloat(t.balance) * t.usd, 0);

  const handleSend = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 1500));
    await base44.entities.Transaction.create({
      type: "send",
      currency: "SUI",
      amount: parseFloat(amount),
      network: "Sui",
      status: "completed",
      note: `Sent to ${recipient.slice(0, 12)}...`,
      timestamp: new Date().toISOString(),
    });
    setSendOpen(false);
    setSending(false);
    setAmount("");
    setRecipient("");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const handleStake = async (validator) => {
    setStaking(true);
    await new Promise(r => setTimeout(r, 1500));
    await base44.entities.StakingPosition.create({
      network: "Sui",
      asset: "SUI",
      amount: 10,
      apy: validator.apy,
      status: "active",
      validator_name: validator.name,
    });
    setStaking(false);
    qc.invalidateQueries({ queryKey: ["staking"] });
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-400/10 flex items-center justify-center">
          <Hexagon className="h-5 w-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Sui Wallet</h1>
          <p className="text-sm text-muted-foreground">SUI tokens, staking, and DeFi on Sui Network</p>
        </div>
      </div>

      {/* Balance card */}
      <Card className="bg-gradient-to-br from-sky-500/10 to-blue-500/10 border-sky-500/20">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className="text-3xl font-bold">${totalUsd.toFixed(2)}</p>
            </div>
            <Badge variant="outline" className="text-sky-400 border-sky-400/40">Sui Network</Badge>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-muted-foreground truncate flex-1">{suiAddress}</code>
            <button onClick={() => { navigator.clipboard.writeText(suiAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-muted-foreground hover:text-foreground shrink-0">
              {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => setSendOpen(true)}><Send className="h-3.5 w-3.5 mr-1" />Send</Button>
            <Button size="sm" variant="outline" className="flex-1"><Download className="h-3.5 w-3.5 mr-1" />Receive</Button>
            <Button size="sm" variant="outline" className="flex-1"><RefreshCw className="h-3.5 w-3.5 mr-1" />Swap</Button>
          </div>
        </CardContent>
      </Card>

      {/* Send modal */}
      {sendOpen && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between">Send SUI <button onClick={() => setSendOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Recipient (0x... or .sui name)" value={recipient} onChange={e => setRecipient(e.target.value)} className="font-mono text-sm" />
            <Input type="number" placeholder="Amount (SUI)" value={amount} onChange={e => setAmount(e.target.value)} />
            <Button className="w-full" onClick={handleSend} disabled={sending || !recipient || !amount}>
              {sending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Send SUI"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {["portfolio", "staking", "activity"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "portfolio" && (
        <div className="space-y-2">
          {SUI_TOKENS.map(t => (
            <div key={t.symbol} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors">
              <div className="h-9 w-9 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-xs shrink-0">{t.symbol.slice(0, 3)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t.symbol}</p>
                <p className="text-xs text-muted-foreground">{t.name}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm">{t.balance} {t.symbol}</p>
                <p className="text-xs text-muted-foreground">${(parseFloat(t.balance) * t.usd).toFixed(2)}</p>
              </div>
              <div className={`text-xs font-semibold ${t.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                {t.change >= 0 ? "+" : ""}{t.change}%
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "staking" && (
        <div className="space-y-3">
          <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-400">
            <p className="font-semibold">Sui Proof of Stake</p>
            <p className="mt-0.5 text-muted-foreground">Stake SUI to validators and earn ~4% APY. Unstaking takes 1 epoch (~24h).</p>
          </div>
          {VALIDATORS.map(v => (
            <div key={v.name} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{v.name.slice(0, 2)}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{v.name}</p>
                <p className="text-xs text-muted-foreground">{v.stake} staked · {v.commission}% commission</p>
              </div>
              <div className="text-right mr-2">
                <p className="text-sm font-bold text-green-500">{v.apy}%</p>
                <p className="text-xs text-muted-foreground">APY</p>
              </div>
              <Button size="sm" onClick={() => handleStake(v)} disabled={staking}>
                {staking ? <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Stake"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          {RECENT_TXS.map(tx => (
            <div key={tx.digest} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{tx.type}</p>
                <p className="text-xs font-mono text-muted-foreground">{tx.digest}</p>
              </div>
              <div className="text-right">
                <p className="text-sm">{tx.amount}</p>
                <p className="text-xs text-muted-foreground">{tx.age} ago</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}