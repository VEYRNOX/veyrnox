import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Shield, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

function detectAnomalies(transactions, prices, liveOn) {
  const anomalies = [];
  if (!transactions.length) return anomalies;

  const toUsd = (tx) => liveOn ? (tx.amount || 0) * (prices?.[tx.currency] ?? 0) : 0;

  // Large transfer: only meaningful with live prices for cross-currency USD comparison.
  if (liveOn) {
    const amounts = transactions.map(t => toUsd(t));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(amounts.map(a => Math.pow(a - avg, 2)).reduce((a, b) => a + b, 0) / amounts.length);

    transactions.forEach(tx => {
      const usd = toUsd(tx);
      if (usd > avg + 2.5 * std && usd > 500) {
        anomalies.push({
          id: tx.id, type: "large_transfer",
          severity: usd > avg + 4 * std ? "critical" : "high",
          tx, detail: `$${usd.toFixed(0)} — ${((usd - avg) / std).toFixed(1)}σ above average`, usd,
        });
      }
    });
  }

  // Rapid transactions: 3+ within 1 hour (works without live prices).
  const sorted = [...transactions].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  const recent = sorted.slice(0, 5);
  if (recent.length >= 3) {
    const first = new Date(recent[0].created_date), last = new Date(recent[recent.length - 1].created_date);
    if ((first - last) / 60000 < 60) {
      anomalies.push({ id: "rapid-tx", type: "rapid_transactions", severity: "medium", detail: `${recent.length} transactions within 1 hour`, usd: 0 });
    }
  }

  // Unusual hour (2 am–5 am): works without live prices.
  transactions.slice(0, 10).forEach(tx => {
    const h = new Date(tx.created_date).getHours();
    if (h >= 2 && h <= 5) {
      anomalies.push({ id: "hour-" + tx.id, type: "unusual_hour", severity: "low", tx, detail: `Transaction at ${h}:00 — unusual activity hour`, usd: toUsd(tx) });
    }
  });

  return anomalies.slice(0, 10);
}

const SEVERITY_CONFIG = {
  critical: { cls: "bg-destructive/10 text-destructive border-destructive/30", label: "Critical" },
  high: { cls: "bg-orange-500/10 text-orange-500 border-orange-500/30", label: "High" },
  medium: { cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", label: "Medium" },
  low: { cls: "bg-blue-500/10 text-blue-500 border-blue-500/30", label: "Low" },
};

const TYPE_LABELS = { large_transfer: "Large Transfer", rapid_transactions: "Rapid Transactions", unusual_hour: "Unusual Hour" };

export default function AnomalyDetection() {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [dismissed, setDismissed] = useState([]);

  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();

  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 200) });
  const { data: fraudAlerts = [] } = useQuery({ queryKey: ["fraud-alerts"], queryFn: () => base44.entities.FraudAlert.list("-created_date", 20) });

  const scan = async () => {
    setScanning(true);
    setScanned(true);
    setScanning(false);
  };

  const anomalies = detectAnomalies(transactions, prices, liveOn).filter(a => !dismissed.includes(a.id));
  const allAlerts = [...anomalies, ...fraudAlerts.map(f => ({ id: f.id, type: f.alert_type, severity: f.severity, detail: f.description, usd: f.amount || 0, fromDB: true }))];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Anomaly Detection</h1>
        <p className="text-sm text-muted-foreground">Statistical analysis of your transaction patterns</p>
      </div>

      {!liveOn && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Live prices are off — USD-based large-transfer detection is disabled. Velocity and unusual-hour checks still run. Turn on <span className="font-medium text-foreground">Settings → Live Prices</span> for full cross-currency analysis.
        </div>
      )}

      <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 text-center space-y-3">
        <div className="flex justify-center"><Shield className="h-8 w-8 text-primary" /></div>
        <p className="font-semibold">Pattern Scanner</p>
        <p className="text-sm text-muted-foreground">Analyses {transactions.length} transactions for statistical outliers, velocity spikes, and unusual activity hours</p>
        <Button onClick={scan} disabled={scanning} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Run Scan"}
        </Button>
        {scanned && <p className="text-xs text-green-500">✓ Scan complete — {anomalies.length} anomalies detected</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Critical", count: allAlerts.filter(a => a.severity === "critical").length, color: "text-destructive" },
          { label: "High", count: allAlerts.filter(a => a.severity === "high").length, color: "text-orange-500" },
          { label: "Medium / Low", count: allAlerts.filter(a => ["medium", "low"].includes(a.severity)).length, color: "text-yellow-500" },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className={`font-bold text-2xl ${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {allAlerts.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
          <p className="font-medium text-foreground">All Clear</p>
          <p className="text-sm mt-1">No anomalies detected in your transaction history</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{allAlerts.length} Anomalies Found</p>
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
        </div>
      )}
    </div>
  );
}
