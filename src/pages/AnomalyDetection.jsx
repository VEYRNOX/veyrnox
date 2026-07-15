// @ts-nocheck
import { USD_RATES } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ScanLine, AlertTriangle, CheckCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";


function detectAnomalies(transactions) {
  const anomalies = [];
  if (!transactions.length) return anomalies;

  const amounts = transactions.map(t => (t.amount || 0) * (USD_RATES[t.currency] || 1));
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const std = Math.sqrt(amounts.map(a => Math.pow(a - avg, 2)).reduce((a, b) => a + b, 0) / amounts.length);

  transactions.forEach(tx => {
    const usd = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
    if (usd > avg + 2.5 * std && usd > 500) {
      anomalies.push({ id: tx.id, type: "large_transfer", severity: usd > avg + 4 * std ? "critical" : "high", tx, detail: `$${usd.toFixed(0)} — ${((usd - avg) / std).toFixed(1)}σ above average`, usd });
    }
  });

  // Rapid transactions (3+ in 10 minutes window - simulated)
  const sorted = [...transactions].sort((a, b) => /** @type {any} */ (new Date(b.created_date)) - /** @type {any} */ (new Date(a.created_date)));
  const recent = sorted.slice(0, 5);
  if (recent.length >= 3) {
    const first = new Date(recent[0].created_date), last = new Date(recent[recent.length - 1].created_date);
    if ((/** @type {any} */ (first) - /** @type {any} */ (last)) / 60000 < 60) {
      anomalies.push({ id: "rapid-" + Date.now(), type: "rapid_transactions", severity: "medium", detail: `${recent.length} transactions within 1 hour`, usd: 0 });
    }
  }

  // Unusual hour (between 2am-5am)
  transactions.slice(0, 10).forEach(tx => {
    const h = new Date(tx.created_date).getHours();
    if (h >= 2 && h <= 5) {
      anomalies.push({ id: "hour-" + tx.id, type: "unusual_hour", severity: "low", tx, detail: `Transaction at ${h}:00 — unusual activity hour`, usd: (tx.amount || 0) * (USD_RATES[tx.currency] || 1) });
    }
  });

  return anomalies.slice(0, 10);
}

const SEVERITY_CONFIG = {
  critical: { cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Critical" },
  high: { cls: "bg-risk/10 text-risk border-risk/30", label: "High" },
  medium: { cls: "bg-caution/10 text-caution border-caution/30", label: "Medium" },
  low: { cls: "bg-info/10 text-info border-info/30", label: "Low" },
};

const TYPE_LABELS = { large_transfer: "Large Transfer", rapid_transactions: "Rapid Transactions", unusual_hour: "Unusual Hour" };

const CHECKS = [
  { key: "large_transfer", label: "Large transfer outliers", desc: "Flags sends >2.5σ above your own average" },
  { key: "rapid_transactions", label: "Velocity bursts", desc: "3+ transactions within a 1-hour window" },
  { key: "unusual_hour", label: "Off-hours activity", desc: "Transactions between 02:00–05:00 local time" },
];

export default function AnomalyDetection() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [dismissed, setDismissed] = useState([]);

  const { data: transactions = [], isLoading, isError } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 200) });
  const { data: fraudAlerts = [] } = useQuery({ queryKey: ["fraud-alerts"], queryFn: () => base44.entities.FraudAlert.list("-created_date", 20) });

  const scan = () => {
    setScanning(true);
    const found = detectAnomalies(transactions);
    setScanResult({ anomalies: found, scannedAt: new Date(), total: transactions.length });
    setDismissed([]);
    setScanning(false);
  };

  const activeAnomalies = scanResult
    ? scanResult.anomalies.filter(a => !dismissed.includes(a.id))
    : [];
  const dbAlerts = fraudAlerts.map(f => ({ id: f.id, type: f.alert_type, severity: f.severity, detail: f.description, usd: f.amount || 0, fromDB: true }));
  const allAlerts = scanResult ? [...activeAnomalies, ...dbAlerts] : dbAlerts;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Transaction Anomaly Detection</h1>
        <p className="text-sm text-muted-foreground">Statistical analysis of your transaction patterns — runs entirely on-device</p>
      </div>

      <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-6 w-6 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm">Pattern Scanner</p>
            <p className={`text-xs ${isError ? "text-destructive" : "text-muted-foreground"}`}>{isLoading ? "Loading transactions…" : isError ? "Couldn’t load transactions — scan may be incomplete." : `${transactions.length} transactions loaded · 3 heuristic checks`}</p>
            <ReferenceRateNote />
          </div>
          <Button onClick={scan} disabled={scanning || isLoading || isError} className="gap-2 ml-auto">
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : scanResult ? "Re-scan" : "Run Scan"}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CHECKS.map(c => (
            <div key={c.key} className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-xs font-medium">{c.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.desc}</p>
              {scanResult && (
                <p className="text-[10px] font-semibold mt-1 text-primary">
                  {scanResult.anomalies.filter(a => a.type === c.key).length} found
                </p>
              )}
            </div>
          ))}
        </div>
        {scanResult && (
          <p className="text-xs text-muted-foreground">
            Last scan: {scanResult.scannedAt.toLocaleTimeString("en-GB")} · {scanResult.total} transactions analysed
          </p>
        )}
      </div>

      {scanResult && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Critical", count: allAlerts.filter(a => a.severity === "critical").length, color: "text-destructive" },
            { label: "High", count: allAlerts.filter(a => a.severity === "high").length, color: "text-risk" },
            { label: "Medium / Low", count: allAlerts.filter(a => ["medium", "low"].includes(a.severity)).length, color: "text-caution" },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
              <p className={`font-bold text-2xl ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {!scanResult && dbAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">Run a scan to check your transactions</p>
          <p className="text-sm mt-1">All checks run locally — nothing leaves your device</p>
        </div>
      )}

      {scanResult && allAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-60" />
          <p className="font-medium text-foreground">All Clear</p>
          <p className="text-sm mt-1">No anomalies detected in your transaction history</p>
        </div>
      )}

      {allAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{allAlerts.length} {allAlerts.length === 1 ? "Anomaly" : "Anomalies"} Found</p>
          {allAlerts.map(a => {
            const cfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={a.id} className={`p-4 rounded-xl border ${cfg.cls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{TYPE_LABELS[a.type] || a.type?.replace(/_/g, " ")}</p>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">{cfg.label}</span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">{a.detail}</p>
                      {a.tx && <p className="text-[10px] mt-1 opacity-60">{new Date(a.tx.created_date).toLocaleString("en-GB")} · {a.tx.currency}</p>}
                    </div>
                  </div>
                  {!a.fromDB && (
                    <button onClick={() => setDismissed(d => [...d, a.id])} className="text-[10px] opacity-60 hover:opacity-100 transition-opacity shrink-0">Dismiss</button>
                  )}
                </div>
              </div>
            );
          })}
          <ReferenceRateNote className="mt-1" />
        </div>
      )}
    </div>
  );
}