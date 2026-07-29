// @ts-nocheck
//
// I18N (Phase 2 slice 2 batch D): copy driven by `security.fraud.*`.
// Detection functions return `{detailKey, detailVars}` so the RENDER layer
// localizes — same pattern as AnomalyDetection (batch B).
import { useTranslation } from "react-i18next";
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
// financial figure. Returns { detailKey, detailVars } instead of pre-
// formatted English so the notify() call and the on-screen render both
// localize (batch B pattern).
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

  transactions.forEach((tx) => {
    const score = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
    if (score > avg + 2.5 * std && score > 500) {
      const sigma = std > 0 ? ((score - avg) / std).toFixed(1) : "N/A";
      anomalies.push({
        id: tx.id,
        type: "large_transfer",
        severity: score > avg + 4 * std ? "critical" : "high",
        tx,
        detailKey: "fraud.detail.large_transfer",
        detailVars: { amount: tx.amount, currency: tx.currency, sigma },
      });
    }
  });

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
        detailKey: "fraud.detail.rapid_transactions",
        detailVars: { count: recent.length },
      });
    }
  }

  transactions.slice(0, 10).forEach((tx) => {
    const h = new Date(tx.created_date).getHours();
    if (h >= 2 && h <= 5) {
      anomalies.push({
        id: "hour-" + tx.id,
        type: "unusual_hour",
        severity: "low",
        tx,
        detailKey: "fraud.detail.unusual_hour",
        detailVars: { hour: h },
      });
    }
  });

  return anomalies.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Address screening. `labelKey` is a catalog key for tx sender/recipient and
// the address-book default; `labelLiteral` carries a user-typed contact name
// unchanged (never key-looked-up).
// ---------------------------------------------------------------------------
function screenAddresses(addressBook, transactions) {
  const findings = [];
  const checked = new Set();

  const pushFlagged = (address, { labelKey, labelLiteral }, source) => {
    findings.push({
      id: "flag-" + address,
      type: "flagged_address",
      severity: "critical",
      detailKey: "fraud.detail.flagged_address",
      detailVars: {
        labelKey,
        labelLiteral,
        prefix: address.slice(0, 6),
        suffix: address.slice(-4),
      },
      source,
    });
  };

  for (const entry of addressBook) {
    if (!entry.address) continue;
    const k = entry.address.toLowerCase();
    if (checked.has(k)) continue;
    checked.add(k);
    if (isLocallyFlagged(entry.address)) {
      pushFlagged(
        entry.address,
        entry.name
          ? { labelKey: null, labelLiteral: entry.name }
          : { labelKey: "fraud.detail.flagged_address_default_label", labelLiteral: null },
        "address_book",
      );
    }
  }

  for (const tx of transactions.slice(0, 100)) {
    for (const [addr, key] of [
      [tx.to_address, "fraud.detail.flagged_tx_recipient"],
      [tx.from_address, "fraud.detail.flagged_tx_sender"],
    ]) {
      if (!addr) continue;
      const k = addr.toLowerCase();
      if (checked.has(k)) continue;
      checked.add(k);
      if (isLocallyFlagged(addr)) {
        pushFlagged(addr, { labelKey: key, labelLiteral: null }, "transactions");
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Shared config — the CSS-class table stays here (not user-facing); severity
// LABELS come from the catalog.
// ---------------------------------------------------------------------------
const SEVERITY_CLS = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-caution/10 text-caution border-caution/30",
  medium: "bg-caution/10 text-caution border-caution/30",
  low: "bg-info/10 text-info border-info/30",
};

// Icons live here because they're not localizable. Labels/descriptions come
// from the catalog under `fraud.scope.<key>.{label,desc}`.
const SCOPE_CHECKS = [
  { key: "anomalies", icon: ScanLine },
  { key: "addresses", icon: BookUser },
  { key: "alerts", icon: History },
];

export default function FraudDetection() {
  const { t } = useTranslation("security");
  const [scanResult, setScanResult] = useState(null);
  const [dismissed, setDismissed] = useState([]);

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 200),
  });

  const { data: addressBook = [], isLoading: abLoading, isError: abError } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list(),
  });

  const { data: fraudAlerts = [], isLoading: faLoading, isError: faError } = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: () => base44.entities.FraudAlert.list("-created_date", 50),
  });

  const isLoading = txLoading || abLoading || faLoading;
  const isError = txError || abError || faError;

  // Localize a finding's detail line. Handles the flagged-address
  // labelKey/labelLiteral fork so a user-typed contact name never gets
  // key-looked-up.
  const detailFor = (f) => {
    if (f.detailRaw) return f.detailRaw;
    if (!f.detailKey) return "";
    const vars = { ...(f.detailVars || {}) };
    if ("labelKey" in vars || "labelLiteral" in vars) {
      vars.label = vars.labelLiteral ?? (vars.labelKey ? t(vars.labelKey) : "");
      delete vars.labelKey;
      delete vars.labelLiteral;
    }
    return t(f.detailKey, vars);
  };

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

    const ts = Date.now();
    [...anomalies, ...addressFindings].forEach((f) => {
      notifyFraudAlert({ sentence: detailFor(f), severity: f.severity, ts });
    });
  };

  const liveFindings = scanResult
    ? [...scanResult.anomalies, ...scanResult.addressFindings].filter(
        (f) => !dismissed.includes(f.id)
      )
    : [];

  // Stored FraudAlert records. `description` is raw English from the pre-i18n
  // write side (same as AnomalyDetection batch B).
  const dbAlerts = fraudAlerts.map((f) => ({
    id: f.id,
    type: f.alert_type || "stored_alert",
    severity: f.severity || "medium",
    detailRaw: f.description || t("fraud.detail.stored_default"),
    storedAt: f.created_date,
    fromDB: true,
  }));

  const totalFindings = liveFindings.length + dbAlerts.length;
  const hasScanned = scanResult !== null;

  const scannerStatus = isLoading
    ? t("fraud.loading")
    : isError
    ? t("fraud.load_error")
    : t("fraud.loaded_summary", { txCount: transactions.length, addressCount: addressBook.length });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card">
          <ShieldAlert className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t("fraud.heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("fraud.subhead")}</p>
        </div>
      </div>

      {/* Honest scope panel */}
      <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-6 w-6 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("fraud.scanner_title")}</p>
            <p className={`text-xs ${isError ? "text-destructive" : "text-muted-foreground"}`}>
              {scannerStatus}
            </p>
          </div>
          <Button onClick={runScan} disabled={isLoading || isError} className="gap-2 shrink-0">
            <RefreshCw className="h-4 w-4" />
            {hasScanned ? t("fraud.cta_rescan") : t("fraud.cta_scan")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCOPE_CHECKS.map((c) => {
            const Icon = c.icon;
            const count = !hasScanned
              ? null
              : c.key === "anomalies"
              ? scanResult.anomalies.length
              : c.key === "addresses"
              ? scanResult.addressFindings.length
              : dbAlerts.length;
            return (
              <div key={c.key} className="rounded-lg border border-border bg-background/60 px-3 py-2.5 flex gap-2.5 items-start">
                <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">{t(`fraud.scope.${c.key}.label`)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t(`fraud.scope.${c.key}.desc`)}</p>
                  {count !== null && (
                    <p className={`text-[10px] font-semibold mt-1 ${count > 0 ? "text-destructive" : "text-success"}`}>
                      {t("fraud.check_found", { count })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {scanResult && (
          <p className="text-xs text-muted-foreground">
            {t("fraud.last_scan", {
              time: scanResult.scannedAt.toLocaleTimeString(undefined),
              txCount: scanResult.txCount,
              addressCount: scanResult.addressCount,
            })}
          </p>
        )}
      </div>

      {/* Summary counts (post-scan) */}
      {hasScanned && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "critical", count: [...liveFindings, ...dbAlerts].filter(a => a.severity === "critical").length, color: "text-destructive" },
            { key: "high", count: [...liveFindings, ...dbAlerts].filter(a => a.severity === "high").length, color: "text-caution" },
            { key: "medium_low", count: [...liveFindings, ...dbAlerts].filter(a => ["medium", "low"].includes(a.severity)).length, color: "text-caution" },
          ].map((s) => (
            <div key={s.key} className="p-4 rounded-xl border border-border bg-card text-center">
              <p className={`font-bold text-2xl ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t(`fraud.severity.${s.key}`)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pre-scan empty state */}
      {!hasScanned && dbAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">{t("fraud.empty_prescan.title")}</p>
          <p className="text-sm mt-1">{t("fraud.empty_prescan.body")}</p>
        </div>
      )}

      {/* Post-scan all-clear */}
      {hasScanned && totalFindings === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-60" />
          <p className="font-medium text-foreground">{t("fraud.empty_clear.title")}</p>
          <p className="text-sm mt-1">{t("fraud.empty_clear.body")}</p>
        </div>
      )}

      {/* Live scan findings */}
      {liveFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {t(liveFindings.length === 1 ? "fraud.scan_findings_one" : "fraud.scan_findings_other", { count: liveFindings.length })}
          </p>
          {liveFindings.map((f) => {
            const cls = SEVERITY_CLS[f.severity] || SEVERITY_CLS.low;
            const sevLabel = t(`fraud.severity.${f.severity}`, { defaultValue: f.severity });
            const typeLabel = t(`fraud.types.${f.type}`, { defaultValue: f.type?.replace(/_/g, " ") ?? "" });
            return (
              <div key={f.id} className={`p-4 rounded-xl border ${cls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{typeLabel}</p>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">{sevLabel}</span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">{detailFor(f)}</p>
                      {f.tx && (
                        <p className="text-[10px] mt-1 opacity-60">
                          {new Date(f.tx.created_date).toLocaleString(undefined)} · {f.tx.currency}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissed((d) => [...d, f.id])}
                    className="text-[10px] opacity-60 hover:opacity-100 transition-opacity shrink-0"
                  >
                    {t("fraud.dismiss")}
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
            {t(dbAlerts.length === 1 ? "fraud.stored_alerts_one" : "fraud.stored_alerts_other", { count: dbAlerts.length })}
          </p>
          {dbAlerts.map((a) => {
            const cls = SEVERITY_CLS[a.severity] || SEVERITY_CLS.low;
            const sevLabel = t(`fraud.severity.${a.severity}`, { defaultValue: a.severity });
            const typeLabel = t(`fraud.types.${a.type}`, { defaultValue: a.type?.replace(/_/g, " ") ?? "" });
            return (
              <div key={a.id} className={`p-4 rounded-xl border ${cls}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{typeLabel}</p>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">{sevLabel}</span>
                      <span className="text-[10px] opacity-50">{t("fraud.stored_badge")}</span>
                    </div>
                    <p className="text-xs mt-0.5 opacity-80">{detailFor(a)}</p>
                    {a.storedAt && (
                      <p className="text-[10px] mt-1 opacity-60">
                        {new Date(a.storedAt).toLocaleString(undefined)}
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
        {t("fraud.footer")}
      </p>
    </div>
  );
}
