import { USD_RATES } from "@/lib/cryptos";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocallyFlagged } from "@/wallet-core/evm/poison";
import {
  ShieldAlert,
  ScanLine,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ShieldCheck,
  BookUser,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyFraudAlert } from "@/notify/sources";

// ---------------------------------------------------------------------------
// Anomaly detection — same 3-check logic as AnomalyDetection.jsx.
// USD_RATES is used for normalisation/comparison only, never displayed as a
// financial figure.
// ---------------------------------------------------------------------------
function detectAnomalies(transactions) {
  const anomalies = [];
  if (!transactions.length) return anomalies;

  const amounts = transactions.map(
    (t) => (t.amount || 0) * (USD_RATES[t.currency] || 1)
  );
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const std = Math.sqrt(
    amounts
      .map((a) => Math.pow(a - avg, 2))
      .reduce((a, b) => a + b, 0) / amounts.length
  );

  // Check 1 — large transfer outliers
  transactions.forEach((tx) => {
    const score = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
    if (score > avg + 2.5 * std && score > 500) {
      const sigmas = std > 0 ? ((score - avg) / std).toFixed(1) : "N/A";
      anomalies.push({
        id: tx.id,
        type: "large_transfer",
        severity: score > avg + 4 * std ? "critical" : "high",
        tx,
        detail: `${tx.amount} ${tx.currency} — ${sigmas}σ above your average send`,
      });
    }
  });

  // Check 2 — velocity burst (3+ transactions in 1-hour window)
  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
  );
  const recent = sorted.slice(0, 5);
  if (recent.length >= 3) {
    const first = new Date(recent[0].created_date);
    const last = new Date(recent[recent.length - 1].created_date);
    if ((first.getTime() - last.getTime()) / 60000 < 60) {
      anomalies.push({
        id: "rapid-" + first.getTime(),
        type: "rapid_transactions",
        severity: "medium",
        detail: `${recent.length} transactions within 1 hour`,
      });
    }
  }

  // Check 3 — off-hours activity (02:00–05:00 local)
  transactions.slice(0, 10).forEach((tx) => {
    const h = new Date(tx.created_date).getHours();
    if (h >= 2 && h <= 5) {
      anomalies.push({
        id: "hour-" + tx.id,
        type: "unusual_hour",
        severity: "low",
        tx,
        detail: `Transaction at ${h}:00 — outside typical activity hours`,
      });
    }
  });

  return anomalies.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Address screening — checks AddressBook + tx counterparties against
// isLocallyFlagged (burn/null addresses and local scam-sink list).
// ---------------------------------------------------------------------------
function screenAddresses(addressBook, transactions) {
  const findings = [];
  const checked = new Set();

  const check = (address, label, source) => {
    if (!address || checked.has(address.toLowerCase())) return;
    checked.add(address.toLowerCase());
    if (isLocallyFlagged(address)) {
      findings.push({
        id: "flag-" + address,
        type: "flagged_address",
        severity: "critical",
        detail: `${label} (${address.slice(0, 6)}…${address.slice(-4)}) matches local flagged-address list`,
        source,
      });
    }
  };

  // Address book contacts
  for (const entry of addressBook) {
    check(entry.address, entry.name || "Address book entry", "address_book");
  }

  // Transaction counterparties
  for (const tx of transactions.slice(0, 100)) {
    if (tx.to_address)
      check(tx.to_address, "Transaction recipient", "transactions");
    if (tx.from_address)
      check(tx.from_address, "Transaction sender", "transactions");
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG = {
  critical: {
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    label: "Critical",
  },
  high: {
    cls: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    label: "High",
  },
  medium: {
    cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    label: "Medium",
  },
  low: {
    cls: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    label: "Low",
  },
};

const TYPE_LABELS = {
  large_transfer: "Large Transfer",
  rapid_transactions: "Rapid Transactions",
  unusual_hour: "Off-hours Activity",
  flagged_address: "Flagged Address",
};

const SCOPE_CHECKS = [
  {
    key: "anomalies",
    icon: ScanLine,
    label: "Transaction anomalies",
    desc: "Large outliers (>2.5σ), velocity bursts, off-hours sends",
  },
  {
    key: "addresses",
    icon: BookUser,
    label: "Address screening",
    desc: "Address book + tx counterparties vs. local flagged-address list",
  },
  {
    key: "alerts",
    icon: History,
    label: "Stored fraud alerts",
    desc: "FraudAlert records saved to local IndexedDB",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function FraudDetection() {
  const [scanResult, setScanResult] = useState(null);
  const [dismissed, setDismissed] = useState([]);

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 200),
  });

  const { data: addressBook = [], isLoading: abLoading } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list(),
  });

  const { data: fraudAlerts = [], isLoading: faLoading } = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: () => base44.entities.FraudAlert.list("-created_date", 50),
  });

  const isLoading = txLoading || abLoading || faLoading;

  const runScan = () => {
    const anomalies = detectAnomalies(transactions);
    const addressFindings = screenAddresses(addressBook, transactions);
    setScanResult({
      anomalies,
      addressFindings,
      scannedAt: new Date(),
      txCount: transactions.length,
      addressCount: addressBook.length,
    });
    setDismissed([]);

    // Fire a Security-tab notification for each critical/high finding (I4: fire-and-forget).
    const ts = Date.now();
    [...anomalies, ...addressFindings].forEach((f) => {
      notifyFraudAlert({ sentence: f.detail, severity: f.severity, ts });
    });
  };

  // Merge live scan findings
  const liveFindings = scanResult
    ? [...scanResult.anomalies, ...scanResult.addressFindings].filter(
        (f) => !dismissed.includes(f.id)
      )
    : [];

  // Stored FraudAlert records shown separately
  const dbAlerts = fraudAlerts.map((f) => ({
    id: f.id,
    type: f.alert_type || "stored_alert",
    severity: f.severity || "medium",
    detail: f.description || "Stored fraud alert",
    storedAt: f.created_date,
    fromDB: true,
  }));

  const totalFindings = liveFindings.length + dbAlerts.length;
  const hasScanned = scanResult !== null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card">
          <ShieldAlert className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Security Scan</h1>
          <p className="text-sm text-muted-foreground">
            On-device heuristic checks — no external calls
          </p>
        </div>
      </div>

      {/* Honest scope panel */}
      <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-6 w-6 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Scanner</p>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading data…"
                : `${transactions.length} transactions · ${addressBook.length} address book entries · 3 checks`}
            </p>
          </div>
          <Button
            onClick={runScan}
            disabled={isLoading}
            className="gap-2 shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            {hasScanned ? "Re-scan" : "Run Scan"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCOPE_CHECKS.map((c) => {
            const Icon = c.icon;
            const count =
              !hasScanned
                ? null
                : c.key === "anomalies"
                ? scanResult.anomalies.length
                : c.key === "addresses"
                ? scanResult.addressFindings.length
                : dbAlerts.length;
            return (
              <div
                key={c.key}
                className="rounded-lg border border-border bg-background/60 px-3 py-2.5 flex gap-2.5 items-start"
              >
                <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {c.desc}
                  </p>
                  {count !== null && (
                    <p
                      className={`text-[10px] font-semibold mt-1 ${
                        count > 0 ? "text-destructive" : "text-green-500"
                      }`}
                    >
                      {count} found
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {scanResult && (
          <p className="text-xs text-muted-foreground">
            Last scan: {scanResult.scannedAt.toLocaleTimeString("en-GB")} ·{" "}
            {scanResult.txCount} transactions · {scanResult.addressCount}{" "}
            addresses screened
          </p>
        )}
      </div>

      {/* Summary counts (post-scan) */}
      {hasScanned && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Critical",
              count: [...liveFindings, ...dbAlerts].filter(
                (a) => a.severity === "critical"
              ).length,
              color: "text-destructive",
            },
            {
              label: "High",
              count: [...liveFindings, ...dbAlerts].filter(
                (a) => a.severity === "high"
              ).length,
              color: "text-orange-500",
            },
            {
              label: "Medium / Low",
              count: [...liveFindings, ...dbAlerts].filter((a) =>
                ["medium", "low"].includes(a.severity)
              ).length,
              color: "text-yellow-500",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="p-4 rounded-xl border border-border bg-card text-center"
            >
              <p className={`font-bold text-2xl ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pre-scan empty state */}
      {!hasScanned && dbAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">Run a scan to start</p>
          <p className="text-sm mt-1">
            All checks run on local data — nothing leaves your device
          </p>
        </div>
      )}

      {/* Post-scan all-clear */}
      {hasScanned && totalFindings === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
          <p className="font-medium text-foreground">Nothing found</p>
          <p className="text-sm mt-1">
            No anomalies, no flagged addresses, no stored alerts
          </p>
        </div>
      )}

      {/* Live scan findings */}
      {liveFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {liveFindings.length} scan{" "}
            {liveFindings.length === 1 ? "finding" : "findings"}
          </p>
          {liveFindings.map((f) => {
            const cfg = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={f.id} className={`p-4 rounded-xl border ${cfg.cls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">
                          {TYPE_LABELS[f.type] || f.type?.replace(/_/g, " ")}
                        </p>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">{f.detail}</p>
                      {f.tx && (
                        <p className="text-[10px] mt-1 opacity-60">
                          {new Date(f.tx.created_date).toLocaleString("en-GB")}{" "}
                          · {f.tx.currency}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissed((d) => [...d, f.id])}
                    className="text-[10px] opacity-60 hover:opacity-100 transition-opacity shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stored FraudAlert records */}
      {dbAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4" />
            {dbAlerts.length} stored{" "}
            {dbAlerts.length === 1 ? "alert" : "alerts"}
          </p>
          {dbAlerts.map((a) => {
            const cfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={a.id} className={`p-4 rounded-xl border ${cfg.cls}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">
                        {TYPE_LABELS[a.type] || a.type?.replace(/_/g, " ")}
                      </p>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">
                        {cfg.label}
                      </span>
                      <span className="text-[10px] opacity-50">saved</span>
                    </div>
                    <p className="text-xs mt-0.5 opacity-80">{a.detail}</p>
                    {a.storedAt && (
                      <p className="text-[10px] mt-1 opacity-60">
                        {new Date(a.storedAt).toLocaleString("en-GB")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer disclaimer */}
      <p className="text-xs text-muted-foreground text-center pb-2">
        Checks run on local data only — no external call is made
      </p>
    </div>
  );
}
