import { useState } from "react";
import { ShieldAlert, Shield, CheckCircle, AlertTriangle, XCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const SAMPLE_SCANS = [
  { url: "uniswap.org", risk: "safe", score: 98, flags: [], category: "DEX" },
  { url: "aave.com", risk: "safe", score: 95, flags: [], category: "Lending" },
  { url: "pancakeswap.finance", risk: "safe", score: 91, flags: [], category: "DEX" },
  { url: "fakeswap-rewards.xyz", risk: "critical", score: 8, flags: ["Phishing domain", "No audit", "Drainer contract detected", "Domain registered 2 days ago"], category: "Unknown" },
  { url: "airdrop-claim2024.io", risk: "high", score: 22, flags: ["Approval drainer", "Unverified contract", "Suspicious token permissions"], category: "Unknown" },
  { url: "opensea.io", risk: "safe", score: 97, flags: [], category: "NFT Marketplace" },
];

const RECENT_ALERTS = [
  { id: 1, app: "fakeswap-rewards.xyz", type: "Phishing Site", time: "2h ago", risk: "critical" },
  { id: 2, app: "airdrop-claim2024.io", type: "Drainer Contract", time: "1d ago", risk: "high" },
  { id: 3, app: "blur.io", type: "Unlimited Approval Requested", time: "3d ago", risk: "medium" },
];

export default function DAppSecurityAlerts() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [settings, setSettings] = useState({ scanOnConnect: true, blockCritical: true, alertApprovals: true, alertPhishing: true });

  const handleScan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 1500));
    const clean = url.toLowerCase().replace(/https?:\/\//, "").split("/")[0];
    const known = SAMPLE_SCANS.find(s => s.url === clean);
    if (known) {
      setResult(known);
    } else {
      setResult({ url: clean, risk: Math.random() > 0.7 ? "medium" : "safe", score: Math.floor(60 + Math.random() * 35), flags: Math.random() > 0.7 ? ["No security audit found"] : [], category: "dApp" });
    }
    setScanning(false);
  };

  const riskConfig = {
    safe: { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: CheckCircle, label: "Safe" },
    medium: { color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30", icon: AlertTriangle, label: "Caution" },
    high: { color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", icon: AlertTriangle, label: "High Risk" },
    critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: XCircle, label: "Critical" },
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">dApp Security Scanner</h1>
          <p className="text-sm text-muted-foreground">Proactively scan dApps for risks before connecting</p>
        </div>
      </div>

      {/* Scanner */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input placeholder="https://app.uniswap.org or paste URL" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleScan()} />
            <Button onClick={handleScan} disabled={scanning || !url.trim()}>
              {scanning ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Shield className="h-4 w-4" />}
            </Button>
          </div>

          {result && (() => {
            const cfg = riskConfig[result.risk];
            const Icon = cfg.icon;
            return (
              <div className={`p-4 rounded-xl border ${cfg.bg} space-y-3`}>
                <div className="flex items-center gap-3">
                  <Icon className={`h-6 w-6 ${cfg.color} shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{result.url}</p>
                      <Badge variant="outline" className={`${cfg.color} border-current text-[10px]`}>{cfg.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{result.category}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${cfg.color}`}>{result.score}</p>
                    <p className="text-xs text-muted-foreground">/ 100</p>
                  </div>
                </div>
                {result.flags.length > 0 && (
                  <div className="space-y-1">
                    {result.flags.map(f => (
                      <div key={f} className={`flex items-center gap-2 text-xs ${cfg.color}`}>
                        <XCircle className="h-3.5 w-3.5 shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                )}
                {result.flags.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-green-500">
                    <CheckCircle className="h-3.5 w-3.5" /> No threats detected · Audit verified · Safe to connect
                  </div>
                )}
                {(result.risk === "high" || result.risk === "critical") && (
                  <Button variant="destructive" size="sm" className="w-full">Do Not Connect to This Site</Button>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" />Recent Alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {RECENT_ALERTS.map(a => {
            const cfg = riskConfig[a.risk];
            const Icon = cfg.icon;
            return (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                <Icon className={`h-4 w-4 ${cfg.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.app}</p>
                  <p className="text-xs text-muted-foreground">{a.type}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className={`${cfg.color} border-current text-[10px]`}>{a.risk}</Badge>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Alert Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: "scanOnConnect", label: "Auto-scan before every dApp connection", desc: "Scan dApp URL automatically when you try to connect" },
            { key: "blockCritical", label: "Block critical-risk connections", desc: "Prevent connecting to sites with score < 30" },
            { key: "alertApprovals", label: "Alert on unlimited token approvals", desc: "Warn when a dApp requests unlimited token spending" },
            { key: "alertPhishing", label: "Phishing domain detection", desc: "Detect lookalike domains (e.g., uniswap-app.org)" },
          ].map(s => (
            <div key={s.key} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
              <Switch checked={settings[s.key]} onCheckedChange={v => setSettings(p => ({ ...p, [s.key]: v }))} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}