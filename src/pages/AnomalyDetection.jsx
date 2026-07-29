// @ts-nocheck
//
// I18N (Phase 2 slice 2 batch B): copy driven by `security.anomaly.*`.
// Detail strings (from detectAnomalies) use i18next interpolation for the
// dynamic values — so a French user sees "3 transactions en 1 heure" instead
// of the English template. Anomaly TYPE and SEVERITY keys stay as internal
// slug strings — those aren't user-facing and downstream code (fraud alerts
// from Supabase) sends them the same way regardless of locale.
import { useTranslation } from "react-i18next";
import { USD_RATES } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ScanLine, AlertTriangle, CheckCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";


// Pure detector — returns anomalies with a `detailKey` + `detailVars` pair so
// the RENDER layer localizes. Previously baked English prose into `detail`,
// which locked the wording to en and blocked translation of the busiest
// text on the screen.
function detectAnomalies(transactions) {
  const anomalies = [];
  if (!transactions.length) return anomalies;

  const amounts = transactions.map(t => (t.amount || 0) * (USD_RATES[t.currency] || 1));
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const std = Math.sqrt(amounts.map(a => Math.pow(a - avg, 2)).reduce((a, b) => a + b, 0) / amounts.length);

  transactions.forEach(tx => {
    const usd = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
    if (usd > avg + 2.5 * std && usd > 500) {
      anomalies.push({
        id: tx.id,
        type: "large_transfer",
        severity: usd > avg + 4 * std ? "critical" : "high",
        tx,
        detailKey: "anomaly.detail.large_transfer",
        detailVars: { usd: usd.toFixed(0), sigma: ((usd - avg) / std).toFixed(1) },
        usd,
      });
    }
  });

  // Rapid transactions (3+ in 10 minutes window - simulated)
  const sorted = [...transactions].sort((a, b) => /** @type {any} */ (new Date(b.created_date)) - /** @type {any} */ (new Date(a.created_date)));
  const recent = sorted.slice(0, 5);
  if (recent.length >= 3) {
    const first = new Date(recent[0].created_date), last = new Date(recent[recent.length - 1].created_date);
    if ((/** @type {any} */ (first) - /** @type {any} */ (last)) / 60000 < 60) {
      anomalies.push({
        id: "rapid-" + Date.now(),
        type: "rapid_transactions",
        severity: "medium",
        detailKey: "anomaly.detail.rapid_transactions",
        detailVars: { count: recent.length },
        usd: 0,
      });
    }
  }

  // Unusual hour (between 2am-5am)
  transactions.slice(0, 10).forEach(tx => {
    const h = new Date(tx.created_date).getHours();
    if (h >= 2 && h <= 5) {
      anomalies.push({
        id: "hour-" + tx.id,
        type: "unusual_hour",
        severity: "low",
        tx,
        detailKey: "anomaly.detail.unusual_hour",
        detailVars: { hour: h },
        usd: (tx.amount || 0) * (USD_RATES[tx.currency] || 1),
      });
    }
  });

  return anomalies.slice(0, 10);
}

const SEVERITY_CLS = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-risk/10 text-risk border-risk/30",
  medium: "bg-caution/10 text-caution border-caution/30",
  low: "bg-info/10 text-info border-info/30",
};

// Which heuristic checks to render, in order. Labels/descs come from the
// catalog (security.anomaly.checks.<key>.{label,desc}).
const CHECKS = ["large_transfer", "rapid_transactions", "unusual_hour"];

export default function AnomalyDetection() {
  const { t } = useTranslation("security");
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
  // Supabase fraud alerts don't carry a detailKey (they were written before
  // i18n existed). Pass the raw description through — it stays English until
  // the row-writing side is also localized. Marked with `fromDB: true` so the
  // dismiss button also hides for these (existing behaviour).
  const dbAlerts = fraudAlerts.map(f => ({
    id: f.id,
    type: f.alert_type,
    severity: f.severity,
    detailRaw: f.description,
    usd: f.amount || 0,
    fromDB: true,
  }));
  const allAlerts = scanResult ? [...activeAnomalies, ...dbAlerts] : dbAlerts;

  const scannerStatus = isLoading
    ? t("anomaly.loading")
    : isError
      ? t("anomaly.load_error")
      : t("anomaly.loaded_count", { count: transactions.length });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("anomaly.heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("anomaly.subhead")}</p>
      </div>

      <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-6 w-6 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm">{t("anomaly.scanner_title")}</p>
            <p className={`text-xs ${isError ? "text-destructive" : "text-muted-foreground"}`}>{scannerStatus}</p>
            <ReferenceRateNote />
          </div>
          <Button onClick={scan} disabled={scanning || isLoading || isError} className="gap-2 ml-auto">
            <RefreshCw className={`h-4 w-4 ${scanning ? "motion-safe:animate-spin" : ""}`} />
            {scanning ? t("anomaly.cta_scanning") : scanResult ? t("anomaly.cta_rescan") : t("anomaly.cta_scan")}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CHECKS.map(key => (
            <div key={key} className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-xs font-medium">{t(`anomaly.checks.${key}.label`)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t(`anomaly.checks.${key}.desc`)}</p>
              {scanResult && (
                <p className="text-[10px] font-semibold mt-1 text-primary">
                  {t("anomaly.check_found", { count: scanResult.anomalies.filter(a => a.type === key).length })}
                </p>
              )}
            </div>
          ))}
        </div>
        {scanResult && (
          <p className="text-xs text-muted-foreground">
            {t("anomaly.last_scan", { time: scanResult.scannedAt.toLocaleTimeString(undefined), count: scanResult.total })}
          </p>
        )}
      </div>

      {scanResult && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "critical", count: allAlerts.filter(a => a.severity === "critical").length, color: "text-destructive" },
            { key: "high", count: allAlerts.filter(a => a.severity === "high").length, color: "text-risk" },
            { key: "medium_low", count: allAlerts.filter(a => ["medium", "low"].includes(a.severity)).length, color: "text-caution" },
          ].map(s => (
            <div key={s.key} className="p-4 rounded-xl border border-border bg-card text-center">
              <p className={`font-bold text-2xl ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t(`anomaly.severity.${s.key}`)}</p>
            </div>
          ))}
        </div>
      )}

      {!scanResult && dbAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">{t("anomaly.empty_prescan.title")}</p>
          <p className="text-sm mt-1">{t("anomaly.empty_prescan.body")}</p>
        </div>
      )}

      {scanResult && allAlerts.length === 0 && (
        <div className="text-center py-14 text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-60" />
          <p className="font-medium text-foreground">{t("anomaly.empty_clear.title")}</p>
          <p className="text-sm mt-1">{t("anomaly.empty_clear.body")}</p>
        </div>
      )}

      {allAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {t(allAlerts.length === 1 ? "anomaly.found_one" : "anomaly.found_other", { count: allAlerts.length })}
          </p>
          {allAlerts.map(a => {
            const sevCls = SEVERITY_CLS[a.severity] || SEVERITY_CLS.low;
            const sevLabel = t(`anomaly.severity.${a.severity}`, { defaultValue: a.severity });
            // Two detail sources: i18n-templated (from local detector) or raw
            // (DB rows written pre-i18n). Fall back to the type slug if neither.
            const detailText = a.detailKey
              ? t(a.detailKey, a.detailVars)
              : (a.detailRaw ?? "");
            const typeLabel = t(`anomaly.types.${a.type}`, {
              defaultValue: a.type?.replace(/_/g, " ") ?? "",
            });
            return (
              <div key={a.id} className={`p-4 rounded-xl border ${sevCls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{typeLabel}</p>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border">{sevLabel}</span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">{detailText}</p>
                      {a.tx && <p className="text-[10px] mt-1 opacity-60">{new Date(a.tx.created_date).toLocaleString(undefined)} · {a.tx.currency}</p>}
                    </div>
                  </div>
                  {!a.fromDB && (
                    <button onClick={() => setDismissed(d => [...d, a.id])} className="text-[10px] opacity-60 hover:opacity-100 transition-opacity shrink-0">{t("anomaly.dismiss")}</button>
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
