import { useState } from "react";
import { Send, ArrowDownUp, Copy, Check, ExternalLink, Zap, Shield, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TRX_USD = 0.124;
const TRON_ADDR = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

const TRC20_TOKENS = [
  { symbol: "USDT", name: "Tether USD (TRC-20)", balance: 5240.00, price: 1.0, contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", verified: true, logo: "💵" },
  { symbol: "USDC", name: "USD Coin (TRC-20)", balance: 1200.00, price: 1.0, contract: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", verified: true, logo: "🔵" },
  { symbol: "BTT", name: "BitTorrent Token", balance: 4500000, price: 0.0000009, contract: "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4", verified: true, logo: "🌀" },
  { symbol: "JST", name: "JUST", balance: 2800.0, price: 0.035, contract: "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9", verified: true, logo: "⚡" },
  { symbol: "SUN", name: "SUN Token", balance: 120.0, price: 0.012, contract: "TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9", verified: true, logo: "☀️" },
  { symbol: "WIN", name: "WINkLink", balance: 125000, price: 0.000085, contract: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", verified: true, logo: "🎯" },
];

const ENERGY_BANDWIDTH = { energy: 18500, maxEnergy: 50000, bandwidth: 4200, maxBandwidth: 5000 };

const DAPPS = [
  { name: "JustSwap", category: "DEX", tvl: "420M", logo: "⚡" },
  { name: "Sun.io", category: "Yield Farm", tvl: "280M", logo: "☀️" },
  { name: "APENFT", category: "NFT Market", tvl: "N/A", logo: "🖼️" },
  { name: "JustLend", category: "Lending", tvl: "180M", logo: "🏦" },
];

export default function TronWallet() {
  const [tab, setTab] = useState("tokens");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendToken, setSendToken] = useState("TRX");
  const [copied, setCopied] = useState(false);

  const TRX_BALANCE = 4820.0;
  const copy = () => { navigator.clipboard.writeText(TRON_ADDR); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const totalUSD = TRX_BALANCE * TRX_USD + TRC20_TOKENS.reduce((s, t) => s + t.balance * t.price, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm">TRX</div>
            <div>
              <p className="font-bold">TRON Wallet</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-mono text-muted-foreground">{TRON_ADDR.slice(0,10)}...{TRON_ADDR.slice(-6)}</p>
                <button onClick={copy}>{copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}</button>
                <a href={`https://tronscan.org/#/address/${TRON_ADDR}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 text-muted-foreground" /></a>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">${totalUSD.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">{TRX_BALANCE.toLocaleString()} TRX</p>
          </div>
        </div>

        {/* Energy / Bandwidth */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Energy", val: ENERGY_BANDWIDTH.energy, max: ENERGY_BANDWIDTH.maxEnergy, color: "bg-orange-500" },
            { label: "Bandwidth", val: ENERGY_BANDWIDTH.bandwidth, max: ENERGY_BANDWIDTH.maxBandwidth, color: "bg-blue-500" },
          ].map(r => (
            <div key={r.label} className="p-2 rounded-xl bg-white/5">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold">{r.val.toLocaleString()} / {r.max.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10">
                <div className={`h-1.5 rounded-full ${r.color}`} style={{ width: `${(r.val / r.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button className="flex-1 gap-2 bg-red-600 hover:bg-red-700 h-10" onClick={() => setSendOpen(true)}><Send className="h-4 w-4" /> Send</Button>
          <Button variant="outline" className="flex-1 gap-2 h-10"><ArrowDownUp className="h-4 w-4" /> Swap</Button>
          <Button variant="outline" className="flex-1 gap-2 h-10"><Zap className="h-4 w-4" /> Freeze</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["tokens","TRC-20 Tokens"],["dapps","DApps"],["freeze","Freeze/Vote"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "tokens" && (
        <div className="space-y-2">
          {/* Native TRX */}
          <div className="p-4 rounded-xl border border-red-500/30 bg-card flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-xs shrink-0">TRX</div>
            <div className="flex-1">
              <p className="font-semibold">TRON</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>TRX</span>
                <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-semibold text-[10px]">Native</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">{TRX_BALANCE.toLocaleString()} TRX</p>
              <p className="text-xs text-muted-foreground">${(TRX_BALANCE * TRX_USD).toFixed(2)}</p>
            </div>
          </div>

          {TRC20_TOKENS.map(t => {
            const usd = t.balance * t.price;
            return (
              <div key={t.symbol} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">{t.logo}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">{t.symbol}</p>
                    {t.verified && <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 font-semibold">✓ TRC-20</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{t.balance >= 1000000 ? `${(t.balance/1000000).toFixed(1)}M` : t.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.symbol}</p>
                  <p className="text-xs text-muted-foreground">${usd >= 0.01 ? usd.toFixed(2) : usd.toFixed(6)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "dapps" && (
        <div className="space-y-3">
          {DAPPS.map(d => (
            <div key={d.name} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xl">{d.logo}</div>
              <div className="flex-1"><p className="font-semibold text-sm">{d.name}</p><p className="text-xs text-muted-foreground">{d.category}</p></div>
              <div className="text-right text-xs"><p className="font-semibold">TVL ${d.tvl}</p></div>
              <Button size="sm" variant="outline" className="h-8 text-xs">Open</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "freeze" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <p className="font-semibold">Freeze TRX for Resources</p>
            <p className="text-xs text-muted-foreground">Freeze TRX to get Energy (for smart contracts) or Bandwidth (for TRC-20 transfers) and voting power (TP).</p>
            <div className="grid grid-cols-2 gap-3 text-xs text-center">
              <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <p className="text-orange-400 font-semibold">⚡ Energy</p>
                <p className="text-muted-foreground mt-1">For smart contract calls</p>
                <p className="font-bold mt-1">{ENERGY_BANDWIDTH.energy.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-blue-400 font-semibold">📡 Bandwidth</p>
                <p className="text-muted-foreground mt-1">For token transfers</p>
                <p className="font-bold mt-1">{ENERGY_BANDWIDTH.bandwidth.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder="Amount TRX to freeze" className="flex-1" />
              <Button className="bg-red-600 hover:bg-red-700 shrink-0">Freeze</Button>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <p className="font-semibold">Super Representative Voting</p>
            <p className="text-xs text-muted-foreground">Vote for Super Representatives with your TP (Tron Power) to earn daily rewards.</p>
            <div className="space-y-1.5">
              {["Binance Staking","Poloniex","Huobi TRON"].map((sr, i) => (
                <div key={sr} className="flex items-center justify-between p-2 rounded-lg bg-secondary text-xs">
                  <span className="font-semibold">#{i+1} {sr}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">{(5.2 - i * 0.3).toFixed(1)}% APY</span>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">Vote</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send on TRON</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Recipient (T-address)</Label><Input className="mt-1.5 font-mono text-xs" placeholder="T..." /></div>
            <div><Label>Token</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {["TRX","USDT","USDC"].map(s => (
                  <button key={s} onClick={() => setSendToken(s)} className={`p-2 rounded-xl border text-xs font-semibold transition-colors ${sendToken === s ? "border-primary bg-primary/5" : "border-border"}`}>{s}</button>
                ))}
              </div>
            </div>
            <div><Label>Amount</Label><Input type="number" className="mt-1.5" placeholder="0.00" /></div>
            <p className="text-xs text-muted-foreground">Network fee: ~1-5 TRX energy · Instant finality</p>
            <Button className="w-full bg-red-600 hover:bg-red-700">Send {sendToken}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}