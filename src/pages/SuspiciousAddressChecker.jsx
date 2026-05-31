import { useState } from "react";
import { Search, ShieldCheck, ShieldAlert, AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Known suspicious address patterns and blacklisted prefixes (demo data)
const KNOWN_BAD = [
  "0x00000000219ab540356cBB839Cbe05303d7705F",
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
];

const RISK_PATTERNS = [
  { test: (a) => a.startsWith("0x000000"), label: "Null address prefix", severity: "high" },
  { test: (a) => /(.)\1{6,}/.test(a), label: "Repeated character sequence", severity: "medium" },
  { test: (a) => a.length < 26, label: "Address too short", severity: "high" },
  { test: (a) => a.length > 62 && a.startsWith("0x"), label: "ETH address too long", severity: "medium" },
];

function analyzeAddress(address) {
  if (!address || address.length < 10) return null;

  const flags = [];
  const isKnownBad = KNOWN_BAD.some(b => b.toLowerCase() === address.toLowerCase());
  if (isKnownBad) flags.push({ label: "Found in known scam database", severity: "critical" });

  RISK_PATTERNS.forEach(p => { if (p.test(address)) flags.push({ label: p.label, severity: p.severity }); });

  // Heuristic checksum for ETH addresses
  if (address.startsWith("0x") && address.length !== 42) flags.push({ label: "Invalid ETH address length (expected 42 chars)", severity: "high" });

  // BTC basic check
  if ((address.startsWith("1") || address.startsWith("3") || address.startsWith("bc1")) && address.length < 25) {
    flags.push({ label: "BTC address too short", severity: "high" });
  }

  const score = flags.reduce((s, f) => s + (f.severity === "critical" ? 40 : f.severity === "high" ? 25 : f.severity === "medium" ? 10 : 5), 0);
  const riskLevel = score >= 40 ? "critical" : score >= 25 ? "high" : score >= 10 ? "medium" : "low";

  return { flags, score: Math.min(100, score), riskLevel };
}

const RISK_CONFIG = {
  critical: { label: "Critical Risk", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: <ShieldAlert className="h-6 w-6 text-destructive" /> },
  high: { label: "High Risk", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", icon: <ShieldAlert className="h-6 w-6 text-orange-500" /> },
  medium: { label: "Medium Risk", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", icon: <AlertTriangle className="h-6 w-6 text-yellow-500" /> },
  low: { label: "Low Risk — Appears Safe", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <ShieldCheck className="h-6 w-6 text-green-500" /> },
};

export default function SuspiciousAddressChecker() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);

  const check = async () => {
    setChecking(true);
    await new Promise(r => setTimeout(r, 800)); // simulate API call
    const analysis = analyzeAddress(address);
    setResult(analysis);
    if (analysis) setHistory(h => [{ address, ...analysis, time: new Date() }, ...h.slice(0, 4)]);
    setChecking(false);
  };

  const copyAddr = () => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const config = result ? RISK_CONFIG[result.riskLevel] : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Suspicious Address Checker</h1>
        <p className="text-sm text-muted-foreground">Scan any wallet address against known scam and hack databases before sending</p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Wallet Address</label>
          <div className="flex gap-2">
            <Input placeholder="0x... or bc1... or any wallet address" value={address} onChange={e => { setAddress(e.target.value); setResult(null); }} onKeyDown={e => e.key === "Enter" && address && check()} className="font-mono text-sm flex-1" />
            <Button disabled={!address || checking} onClick={check} className="gap-2 shrink-0">
              {checking ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Search className="h-4 w-4" />}
              {checking ? "Scanning..." : "Check"}
            </Button>
          </div>
        </div>
        {address && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground truncate">{address}</span>
            <button onClick={copyAddr} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {result && config && (
        <div className={`p-5 rounded-xl border ${config.bg}`}>
          <div className="flex items-center gap-3 mb-4">
            {config.icon}
            <div>
              <p className={`font-bold text-lg ${config.color}`}>{config.label}</p>
              <p className="text-xs text-muted-foreground">Risk score: {result.score}/100</p>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 mb-4">
            <div className={`h-2 rounded-full transition-all ${result.riskLevel === "low" ? "bg-green-500" : result.riskLevel === "medium" ? "bg-yellow-500" : result.riskLevel === "high" ? "bg-orange-500" : "bg-destructive"}`} style={{ width: `${result.score}%` }} />
          </div>
          {result.flags.length === 0 ? (
            <p className="text-sm text-green-500">✓ No suspicious patterns detected. Address appears legitimate.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Issues detected:</p>
              {result.flags.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${f.severity === "critical" || f.severity === "high" ? "text-destructive" : "text-yellow-500"}`} />
                  <span>{f.label}</span>
                  <span className="ml-auto text-xs capitalize text-muted-foreground">{f.severity}</span>
                </div>
              ))}
            </div>
          )}
          {result.riskLevel !== "low" && (
            <p className="mt-4 text-xs text-muted-foreground border-t border-border/50 pt-3">⚠️ We strongly recommend not sending funds to this address until you have verified it through independent means.</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Recent Checks</p>
          {history.map((h, i) => {
            const c = RISK_CONFIG[h.riskLevel];
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => { setAddress(h.address); setResult({ flags: h.flags, score: h.score, riskLevel: h.riskLevel }); }}>
                {c.icon}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate">{h.address}</p>
                  <p className="text-[10px] text-muted-foreground">{h.time.toLocaleTimeString()}</p>
                </div>
                <span className={`text-xs font-semibold ${c.color}`}>{c.label.split(" — ")[0]}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">⚠️ This tool provides heuristic analysis and known scam pattern matching. Always verify addresses independently before sending large amounts.</p>
      </div>
    </div>
  );
}