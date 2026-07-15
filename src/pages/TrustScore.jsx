// @ts-nocheck
// pages/TrustScore.jsx
//
// Token spam / scam-airdrop heuristic screening. This page runs the REAL
// wallet-core classifier — `classifyToken` from wallet-core/evm/spam.js, the same
// logic that powers the Spam Token Filter — over a token's PUBLIC metadata
// (name/symbol/how-acquired/value), and reports honestly what the heuristics found.
//
// HONESTY CONTRACT (mirrors spam.js):
//   - NO "on-chain analysis": this inspects strings/numbers locally. It does not
//     read the chain, query a contract, or call any third-party scoring API, and
//     the page no longer claims otherwise.
//   - It NEVER says a token "appears legitimate" / is "safe". It reports either
//     "flagged by local heuristics" (with the concrete reasons) or "not flagged —
//     not a guarantee". A non-flag only means none of the known spam/lure/airdrop
//     patterns matched, which is not proof the token is trustworthy.
//   - Heuristic by design: catches drainer-lure names, claim/reward bait wording,
//     homoglyph tickers, unsolicited airdrops, and worthless-balance tokens.

import { useState } from "react";
import { Shield, ShieldAlert, Search, XCircle, CheckCircle, Info, ServerCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { classifyToken } from "@/wallet-core/evm/spam";

// Representative inputs that exercise the REAL heuristics (no canned verdicts —
// each is classified live by classifyToken when selected).
const EXAMPLES = [
  { label: "USDC", token: { symbol: "USDC", name: "USD Coin" } },
  { label: "Claim-lure airdrop", token: { symbol: "$CLAIM", name: "claim-rewards.xyz", acquired_via: "airdrop", value_usd: 0, balance: 100000 } },
  { label: "Reward bait", token: { symbol: "FREE", name: "Free Reward Voucher visit t.me/drop" } },
];

export default function TrustScore() {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [airdropped, setAirdropped] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = (preset) => {
    const token = preset || {
      symbol: symbol.trim(),
      name: name.trim(),
      acquired_via: airdropped ? "airdrop" : undefined,
    };
    if (!token.symbol && !token.name) return;
    const { spam, reasons } = classifyToken(token);
    setResult({ token, spam, reasons });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Token Spam Screening</h1>
        <p className="text-sm text-muted-foreground">Local heuristic spam / scam-airdrop screening of a token's public name, symbol and how it was acquired</p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Symbol</Label>
            <Input placeholder="e.g. USDC" value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Name (optional)</Label>
            <Input placeholder="e.g. USD Coin" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} className="mt-1" />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
          <div>
            <p className="text-sm font-medium">Received as an unsolicited airdrop</p>
            <p className="text-xs text-muted-foreground">A token you never acquired is itself a spam signal</p>
          </div>
          <Switch checked={airdropped} onCheckedChange={setAirdropped} />
        </div>
        <Button onClick={() => analyze()} disabled={!symbol.trim() && !name.trim()} className="w-full gap-1">
          <Search className="h-4 w-4" /> Screen Token
        </Button>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Quick Check</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.label} onClick={() => { setSymbol(e.token.symbol || ""); setName(e.token.name || ""); setAirdropped(e.token.acquired_via === "airdrop"); analyze(e.token); }}
              className="px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-semibold hover:border-primary transition-colors">
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className={`rounded-2xl border p-5 space-y-4 ${result.spam ? "bg-destructive/10 border-destructive/30" : "bg-secondary/40 border-border"}`}>
          <div className="flex items-center gap-3">
            {result.spam ? <ShieldAlert className="h-8 w-8 text-destructive shrink-0" /> : <Info className="h-8 w-8 text-muted-foreground shrink-0" />}
            <div>
              <p className="text-lg font-bold">{result.token.symbol || result.token.name}</p>
              <p className={`text-sm font-semibold ${result.spam ? "text-destructive" : "text-muted-foreground"}`}>
                {result.spam ? "Flagged by local heuristics" : "Not flagged by local heuristics"}
              </p>
            </div>
          </div>

          {result.spam ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Why it was flagged</p>
              {result.reasons.map((r) => (
                <div key={r} className="flex items-start gap-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">This token matches known spam/scam-airdrop patterns. Do not interact with it or click any link in its name.</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                None of the known spam/lure/airdrop patterns matched. This is <span className="font-medium">not</span> a guarantee
                of safety or legitimacy — the heuristics only catch known patterns from the token's public metadata, not on-chain
                behaviour (honeypots, mint authority, liquidity). Always do your own research before trading.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 pt-1 border-t border-border/60 text-[11px] text-muted-foreground">
            <ServerCog className="h-3 w-3 shrink-0 mt-0.5" />
            <span>Screened locally on this device — no chain reads, no third-party scoring service. For deeper contract-level checks use a dedicated scanner (e.g. GoPlus, De.Fi, Token Sniffer).</span>
          </div>
        </div>
      )}
    </div>
  );
}
