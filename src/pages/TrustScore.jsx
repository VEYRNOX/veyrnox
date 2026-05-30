import { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Search, CheckCircle, XCircle, Info, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const KNOWN_SCAMS = ["SQUID", "SAFEMOON2", "ELONMARS", "BABYDOGE2", "MOONSHOT", "HONEYPOT"];
const KNOWN_SAFE = ["USDC", "USDT", "ETH", "BTC", "SOL", "BNB", "UNI", "AAVE", "LINK", "MATIC", "ARB", "OP", "DAI"];

const RISK_FACTORS = {
  honeypot: "Honeypot detected — cannot sell",
  proxy_contract: "Upgradeable proxy contract",
  high_tax: "Buy/sell tax > 10%",
  mint_function: "Owner can mint unlimited tokens",
  blacklist: "Blacklist function present",
  low_liquidity: "Liquidity < $50K",
  renounced: "Contract ownership renounced",
  verified: "Source code verified on Etherscan",
  liquidity_locked: "Liquidity locked",
  audit: "3rd-party audit present",
};

function calcScore(symbol, contract) {
  const upper = symbol.toUpperCase();
  if (KNOWN_SCAMS.some(s => upper.includes(s))) {
    return { score: 8, tier: "critical", flags: ["honeypot","high_tax","mint_function","blacklist","low_liquidity"] };
  }
  if (KNOWN_SAFE.includes(upper)) {
    return { score: 97, tier: "safe", flags: ["renounced","verified","liquidity_locked","audit"] };
  }
  const hash = Array.from(contract || symbol).reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  const score = 30 + (Math.abs(hash) % 55);
  const tier = score >= 80 ? "safe" : score >= 55 ? "caution" : score >= 30 ? "warning" : "critical";
  const riskPool = ["proxy_contract","high_tax","mint_function","blacklist","low_liquidity"];
  const safePool = ["renounced","verified","liquidity_locked","audit"];
  const numRisks = Math.floor((100 - score) / 25);
  const numSafe = Math.floor(score / 30);
  return { score, tier, flags: [...riskPool.slice(0, numRisks), ...safePool.slice(0, numSafe)] };
}

const TIER_CFG = {
  safe: { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", label: "Safe", icon: ShieldCheck },
  caution: { color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Caution", icon: Shield },
  warning: { color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", label: "Warning", icon: ShieldAlert },
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", label: "Critical Risk", icon: ShieldAlert },
};

const POPULAR = [
  { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", network: "ETH" },
  { symbol: "UNI", contract: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", network: "ETH" },
  { symbol: "SQUID", contract: "0x87230146E138d3F296a9a77e497A2A83012e9Bc5", network: "BSC" },
  { symbol: "SAFEMOON2", contract: "0xaef0a177c8c329cbc8508292bb7e06c00786bbfc", network: "BSC" },
];

function ScoreRing({ score, tier }) {
  const cfg = TIER_CFG[tier];
  const r = 36, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const colorMap = { safe: "#22C55E", caution: "#EAB308", warning: "#F97316", critical: "#EF4444" };
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={colorMap[tier]} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 6} textAnchor="middle" fill="currentColor" fontSize="18" fontWeight="bold">{score}</text>
    </svg>
  );
}

export default function TrustScore() {
  const [query, setQuery] = useState("");
  const [contract, setContract] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async (sym, con) => {
    const s = sym || query;
    if (!s.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setResult({ symbol: s, contract: con || contract, ...calcScore(s, con || contract) });
    setLoading(false);
  };

  const cfg = result ? TIER_CFG[result.tier] : null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Token Trust Score</h1>
        <p className="text-sm text-muted-foreground">Scam and rug-pull detection powered by on-chain analysis</p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input placeholder="Token symbol (e.g. USDC)" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && analyze()} />
          <Button onClick={() => analyze()} disabled={!query.trim() || loading} className="gap-1 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <Input placeholder="Contract address (optional, 0x...)" value={contract} onChange={e => setContract(e.target.value)} className="font-mono text-xs" />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Quick Check</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map(p => (
            <button key={p.symbol} onClick={() => { setQuery(p.symbol); setContract(p.contract); analyze(p.symbol, p.contract); }}
              className="px-2.5 py-1 rounded-lg border border-border bg-card text-xs font-semibold hover:border-primary transition-colors">
              {p.symbol} <span className="text-muted-foreground font-normal">{p.network}</span>
            </button>
          ))}
        </div>
      </div>

      {result && cfg && (
        <div className={`rounded-2xl border p-5 space-y-4 ${cfg.bg}`}>
          <div className="flex items-center gap-4">
            <ScoreRing score={result.score} tier={result.tier} />
            <div>
              <p className="text-2xl font-bold">{result.symbol}</p>
              <div className={`flex items-center gap-1.5 text-sm font-semibold mt-0.5 ${cfg.color}`}>
                <cfg.icon className="h-4 w-4" />
                {cfg.label}
              </div>
              {result.contract && <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate max-w-[200px]">{result.contract}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Analysis Flags</p>
            {result.flags.map(f => {
              const text = RISK_FACTORS[f];
              const isSafe = ["renounced","verified","liquidity_locked","audit"].includes(f);
              return (
                <div key={f} className="flex items-start gap-2 text-xs">
                  {isSafe ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                  <span className={isSafe ? "text-green-500" : "text-destructive"}>{text}</span>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-background/50 text-xs text-muted-foreground">
            {result.tier === "safe" && "This token appears legitimate with strong on-chain signals. Always DYOR before trading."}
            {result.tier === "caution" && "This token has some yellow flags. Proceed with caution and verify the team."}
            {result.tier === "warning" && "High-risk token. Multiple red flags detected. Strongly recommend avoiding."}
            {result.tier === "critical" && "CRITICAL: This token matches known scam/rug patterns. Do NOT buy or interact."}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" />
            Trust scores are simulated for demo. Always verify on GoPlus, De.Fi, or Token Sniffer.
          </div>
        </div>
      )}
    </div>
  );
}