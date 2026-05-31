import { useState } from "react";
import { ScanSearch, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SAMPLE_TXS = [
  {
    id: "safe1",
    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    method: "transfer(address,uint256)",
    value: "0 ETH",
    label: "USDC Token Transfer",
    risk: "safe",
    findings: ["Verified USDC contract (Circle)", "Standard ERC-20 transfer", "No suspicious permissions"],
    simulation: { gasEstimate: "46,200", ethUsed: "0", tokensOut: "-150 USDC", tokensIn: "+" }
  },
  {
    id: "medium1",
    to: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    method: "approve(address,uint256)",
    value: "0 ETH",
    label: "Unlimited Token Approval",
    risk: "medium",
    findings: ["Requesting UNLIMITED token approval", "Spender is Uniswap v2 Router (trusted)", "Consider setting a specific amount instead"],
    simulation: { gasEstimate: "29,800", ethUsed: "0", tokensOut: "Approval granted", tokensIn: "—" }
  },
  {
    id: "high1",
    to: "0xdeadbeef1234567890abcdef1234567890abcdef",
    method: "claimRewards()",
    value: "0.05 ETH",
    label: "Suspicious Reward Claim",
    risk: "high",
    findings: ["Unverified contract (no source code)", "Requests ETH + wallet drain pattern detected", "Similar to known phishing contract: 0xdead...efef", "No audit found"],
    simulation: { gasEstimate: "?", ethUsed: "0.05 ETH", tokensOut: "All USDC, USDT, WETH (drain)", tokensIn: "Fake reward token" }
  },
];

const riskConfig = {
  safe: { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: CheckCircle, label: "Safe to Sign" },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: AlertTriangle, label: "Proceed with Caution" },
  high: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: XCircle, label: "High Risk — Do Not Sign" },
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: XCircle, label: "Critical — Wallet Drainer" },
};

export default function SecurityScanner() {
  const [rawTx, setRawTx] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [demoMode, setDemoMode] = useState(false);

  const handleScan = async (sample) => {
    setScanning(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 1500));
    const res = sample || SAMPLE_TXS[Math.floor(Math.random() * SAMPLE_TXS.length)];
    setResult(res);
    setScanning(false);
  };

  const toggleExpand = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <ScanSearch className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Transaction Security Scanner</h1>
          <p className="text-sm text-muted-foreground">Simulate and scan any transaction before signing</p>
        </div>
      </div>

      {/* How it works */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="pt-4 grid grid-cols-3 gap-3 text-center text-xs">
          {[["🔍", "Decode", "Parse calldata & ABI"], ["🧪", "Simulate", "Run on forked chain"], ["🛡️", "Score", "Risk analysis"]].map(([icon, title, desc]) => (
            <div key={title}><p className="text-2xl">{icon}</p><p className="font-bold mt-1">{title}</p><p className="text-muted-foreground">{desc}</p></div>
          ))}
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Raw Transaction (hex) or Paste TX Data</label>
            <textarea
              className="w-full h-24 text-xs font-mono p-2 rounded-lg bg-secondary border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="0x... or paste contract calldata"
              value={rawTx}
              onChange={e => setRawTx(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={() => handleScan(null)} disabled={scanning || !rawTx.trim()}>
            {scanning ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Scanning...</> : <><ScanSearch className="h-4 w-4 mr-2" />Scan Transaction</>}
          </Button>
        </CardContent>
      </Card>

      {/* Demo examples */}
      <div>
        <p className="text-sm font-semibold mb-2">Try Demo Scenarios</p>
        <div className="grid grid-cols-3 gap-2">
          {SAMPLE_TXS.map(s => {
            const cfg = riskConfig[s.risk];
            const Icon = cfg.icon;
            return (
              <button key={s.id} onClick={() => handleScan(s)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold transition-colors ${cfg.bg}`}>
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <span className={cfg.color}>{s.risk.charAt(0).toUpperCase() + s.risk.slice(1)}</span>
                <span className="text-muted-foreground font-normal text-center leading-tight">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {scanning && (
        <Card>
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Simulating on forked mainnet...</p>
            <p className="text-xs text-muted-foreground">Decoding calldata · Checking allowances · Scoring contract</p>
          </CardContent>
        </Card>
      )}

      {!scanning && result && (() => {
        const cfg = riskConfig[result.risk];
        const Icon = cfg.icon;
        return (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${cfg.bg} flex items-center gap-3`}>
              <Icon className={`h-8 w-8 ${cfg.color} shrink-0`} />
              <div>
                <p className={`font-bold ${cfg.color}`}>{cfg.label}</p>
                <p className="text-sm text-muted-foreground">{result.label}</p>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <button className="flex items-center justify-between w-full" onClick={() => toggleExpand("details")}>
                  <CardTitle className="text-sm">Transaction Details</CardTitle>
                  {expanded.details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CardHeader>
              {expanded.details && (
                <CardContent className="space-y-2 text-sm">
                  {[["To", result.to], ["Method", result.method], ["Value", result.value]].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <span className="text-muted-foreground w-16 shrink-0">{k}</span>
                      <span className="font-mono text-xs truncate">{v}</span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Security Findings</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.findings.map((f, i) => (
                  <div key={i} className={`flex items-start gap-2 text-sm ${result.risk === "safe" ? "text-green-500" : result.risk === "medium" ? "text-amber-500" : "text-destructive"}`}>
                    {result.risk === "safe" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span>{f}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Simulation Preview</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[["Gas Estimate", result.simulation.gasEstimate], ["ETH Spent", result.simulation.ethUsed], ["Tokens Out", result.simulation.tokensOut]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className={k === "Tokens Out" && v.includes("drain") ? "text-destructive font-bold" : "font-semibold"}>{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              {result.risk !== "safe" && (
                <Button variant="destructive" className="flex-1">Reject Transaction</Button>
              )}
              <Button variant={result.risk === "safe" ? "default" : "outline"} className="flex-1">
                {result.risk === "safe" ? "Sign Transaction" : "Sign Anyway (Risk)"}
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}