import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wallet, Send, ArrowDownUp, Plus, Copy, Check, ExternalLink, TrendingUp, TrendingDown, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SOL_USD = 167;

const SPL_TOKENS = [
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", balance: 1240.50, price: 1.0, logo: "💵", verified: true, decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether USD", balance: 520.00, price: 1.0, logo: "💵", verified: true, decimals: 6 },
  { mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "RAY", name: "Raydium", balance: 45.2, price: 2.85, logo: "⚡", verified: true, decimals: 6 },
  { mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", symbol: "ORCA", name: "Orca", balance: 120.0, price: 3.12, logo: "🐋", verified: true, decimals: 6 },
  { mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", symbol: "mSOL", name: "Marinade Staked SOL", balance: 2.14, price: 185.5, logo: "🌊", verified: true, decimals: 9 },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", balance: 340.0, price: 0.98, logo: "🪐", verified: true, decimals: 6 },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", balance: 25000000, price: 0.0000285, logo: "🐕", verified: true, decimals: 5 },
];

const DEFI_PROTOCOLS = [
  { name: "Raydium", type: "DEX/AMM", tvl: "1.2B", apy: "12-85%", logo: "⚡" },
  { name: "Marinade Finance", type: "Liquid Staking", tvl: "840M", apy: "7.2%", logo: "🌊" },
  { name: "Jupiter", type: "Aggregator", tvl: "N/A", apy: "N/A", logo: "🪐" },
  { name: "Orca", type: "DEX", tvl: "285M", apy: "15-60%", logo: "🐋" },
  { name: "Drift Protocol", type: "Perps DEX", tvl: "220M", apy: "N/A", logo: "🌀" },
];

export default function SolanaTokens() {
  const [activeTab, setActiveTab] = useState("tokens");
  const [sendOpen, setSendOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const SOL_WALLET = "8FE27ioQh3T7o22QsYVT5Re96yzcR1DoAuL2rL9FYfHs";
  const SOL_BALANCE = 4.256;

  const copy = () => { navigator.clipboard.writeText(SOL_WALLET); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const totalUSD = SOL_BALANCE * SOL_USD + SPL_TOKENS.reduce((s, t) => s + t.balance * t.price, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/20 to-purple-500/10 border border-teal-500/20">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-sm">◎</div>
            <div>
              <p className="font-bold">Solana Wallet</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-mono text-muted-foreground">{SOL_WALLET.slice(0, 8)}...{SOL_WALLET.slice(-6)}</p>
                <button onClick={copy}>{copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}</button>
                <a href={`https://solscan.io/account/${SOL_WALLET}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 text-muted-foreground" /></a>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">{SOL_BALANCE} SOL native</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700 h-10" onClick={() => setSendOpen(true)}><Send className="h-4 w-4" /> Send</Button>
          <Button variant="outline" className="flex-1 gap-2 h-10"><ArrowDownUp className="h-4 w-4" /> Swap via Jupiter</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {["tokens","defi","staking"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${activeTab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{t === "defi" ? "DeFi" : t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {activeTab === "tokens" && (
        <div className="space-y-2">
          {/* Native SOL */}
          <div className="p-4 rounded-xl border border-teal-500/30 bg-card flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold">◎</div>
            <div className="flex-1">
              <p className="font-semibold">Solana</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>SOL</span>
                <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-500 font-semibold text-[10px]">Native</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">{SOL_BALANCE} SOL</p>
              <p className="text-xs text-muted-foreground">${(SOL_BALANCE * SOL_USD).toFixed(2)}</p>
            </div>
          </div>

          {/* SPL Tokens */}
          {SPL_TOKENS.map(t => {
            const usd = t.balance * t.price;
            const change = ((Math.random() - 0.45) * 10).toFixed(1);
            return (
              <div key={t.mint} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">{t.logo}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">{t.symbol}</p>
                    {t.verified && <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 font-semibold">✓ SPL</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{t.balance >= 1000000 ? `${(t.balance/1000000).toFixed(1)}M` : t.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.symbol}</p>
                  <p className="text-xs text-muted-foreground">${usd.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "defi" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Solana DeFi protocols sorted by TVL</p>
          {DEFI_PROTOCOLS.map(p => (
            <div key={p.name} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xl">{p.logo}</div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.type}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold">TVL ${p.tvl}</p>
                <p className={p.apy === "N/A" ? "text-muted-foreground" : "text-green-500 font-semibold"}>{p.apy} APY</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">Connect</Button>
            </div>
          ))}
        </div>
      )}

      {activeTab === "staking" && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-500/5">
            <p className="font-semibold mb-1">Native SOL Staking</p>
            <p className="text-xs text-muted-foreground mb-3">Delegate SOL to a validator. Earn ~6-8% APY. Unbonding period: 2-3 days.</p>
            <div className="grid grid-cols-3 gap-3 text-center text-xs mb-3">
              <div className="p-3 rounded-xl bg-card border border-border"><p className="text-muted-foreground">APY</p><p className="font-bold text-green-500">7.2%</p></div>
              <div className="p-3 rounded-xl bg-card border border-border"><p className="text-muted-foreground">Staked</p><p className="font-bold">1.5 SOL</p></div>
              <div className="p-3 rounded-xl bg-card border border-border"><p className="text-muted-foreground">Rewards</p><p className="font-bold text-green-500">0.024 SOL</p></div>
            </div>
            <Button className="w-full bg-teal-600 hover:bg-teal-700">Stake More SOL</Button>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="font-semibold mb-1">Liquid Staking (Marinade mSOL)</p>
            <p className="text-xs text-muted-foreground mb-3">Receive mSOL and keep liquidity while earning staking rewards.</p>
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-muted-foreground">You hold: <span className="font-semibold text-foreground">2.14 mSOL</span></span>
              <span className="text-green-500 font-semibold">+7.2% APY</span>
            </div>
            <Button variant="outline" className="w-full">Manage mSOL</Button>
          </div>
        </div>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send on Solana</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Recipient Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="Solana wallet address or .sol domain" /></div>
            <div><Label>Token</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {["SOL", "USDC", "USDT"].map(s => <button key={s} className="p-2 rounded-xl border border-border bg-card text-xs font-semibold hover:border-primary">{s}</button>)}
              </div>
            </div>
            <div><Label>Amount</Label><Input type="number" className="mt-1.5" placeholder="0.00" /></div>
            <p className="text-xs text-muted-foreground">Network fee: ~0.000005 SOL (~$0.001)</p>
            <Button className="w-full bg-teal-600 hover:bg-teal-700">Send</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}