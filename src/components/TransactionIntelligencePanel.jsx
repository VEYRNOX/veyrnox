import { Activity, AlertTriangle, CheckCircle2, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';

const LEVEL_STYLES = {
  OK: { box: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', Icon: ShieldCheck, label: 'Ready' },
  INFO: { box: 'bg-info/10 border-info/30', text: 'text-info', Icon: Activity, label: 'Info' },
  CAUTION: { box: 'bg-caution/10 border-caution/30', text: 'text-caution', Icon: AlertTriangle, label: 'Caution' },
  RISK: { box: 'bg-risk/10 border-risk/40', text: 'text-risk', Icon: ShieldAlert, label: 'Risk' },
  BLOCK: { box: 'bg-risk/10 border-risk/40', text: 'text-risk', Icon: ShieldAlert, label: 'Blocked' },
};

const CONTRIBUTOR_STYLES = {
  OK: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  INFO: 'bg-info/10 text-info border-info/20',
  CAUTION: 'bg-caution/10 text-caution border-caution/20',
  RISK: 'bg-risk/10 text-risk border-risk/20',
  BLOCK: 'bg-risk/10 text-risk border-risk/20',
  PENDING: 'bg-muted text-muted-foreground border-border',
};

function contributorTone(contributor) {
  if (contributor.applicable && !contributor.settled) return 'PENDING';
  return contributor.level || 'PENDING';
}

export default function TransactionIntelligencePanel({
  verdict,
  policy,
  acknowledged = false,
  onAcknowledge,
  acknowledgementLabel = 'I understand the risk and want to sign anyway.',
  onAskAdvisor,
}) {
  if (!verdict || !policy) return null;

  const style = LEVEL_STYLES[verdict.level] || LEVEL_STYLES.CAUTION;
  const { Icon } = style;
  const monoEntries = Object.entries(verdict.evidence?.values || {}).filter(([, v]) => typeof v === 'string');

  return (
    <div className={`rounded-xl border p-3 space-y-3 ${style.box}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.text}`} aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${style.text}`}>Transaction intelligence</p>
              <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${CONTRIBUTOR_STYLES[verdict.level] || CONTRIBUTOR_STYLES.PENDING}`}>
                {style.label}
              </span>
            </div>
            <p className={`text-xs ${style.text}`}>
              {verdict.primaryReason || 'No elevated transaction-intelligence findings.'}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Policy</p>
          <p className="text-xs font-medium">{policy.actionLabel}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {verdict.contributors.map((contributor) => (
          <div
            key={contributor.id}
            className={`rounded-lg border p-2 text-xs space-y-1 ${CONTRIBUTOR_STYLES[contributorTone(contributor)] || CONTRIBUTOR_STYLES.PENDING}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{contributor.label}</span>
              <span className="uppercase tracking-wide text-[10px] opacity-80">
                {contributor.applicable ? (contributor.settled ? contributor.level || 'OK' : 'PENDING') : 'N/A'}
              </span>
            </div>
            <p className="opacity-90">
              {contributor.applicable
                ? (contributor.settled
                    ? (contributor.summary || 'No elevated findings.')
                    : 'Still evaluating this contributor.')
                : 'Not used for this transaction.'}
            </p>
          </div>
        ))}
      </div>

      {policy.reason && (
        <div className="rounded-lg border border-border/70 bg-background/40 p-2 text-xs text-foreground/90">
          <span className="font-medium">Next action:</span> {policy.reason}
        </div>
      )}

      {policy.requiresAcknowledgement && (
        <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border/70 bg-background/40 p-2 text-xs text-foreground/90">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledged}
            onChange={(e) => onAcknowledge?.(e.target.checked)}
          />
          <span>{acknowledgementLabel}</span>
        </label>
      )}

      {(verdict.localSignals.length > 0 || monoEntries.length > 0) && (
        <div className="space-y-2">
          {verdict.localSignals.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active signals</p>
              <div className="flex flex-wrap gap-1.5">
                {verdict.localSignals.map((signal) => (
                  <span
                    key={signal.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${CONTRIBUTOR_STYLES[signal.level] || CONTRIBUTOR_STYLES.PENDING}`}
                  >
                    <Radar className="h-3 w-3" aria-hidden="true" />
                    {signal.id}
                  </span>
                ))}
              </div>
            </div>
          )}
          {monoEntries.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence</p>
              {monoEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs min-w-0">
                  <span className="uppercase tracking-wide text-[10px] text-muted-foreground shrink-0">{key}</span>
                  <span className="mono-value break-all">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {verdict.sourcesConsulted.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Threat-intel sources</p>
          <div className="space-y-1">
            {verdict.sourcesConsulted.map((source) => (
              <div key={`${source.source}-${source.status}`} className="flex items-center justify-between gap-2 text-xs rounded-md border border-border/60 bg-background/40 px-2 py-1">
                <span>{source.source}</span>
                <span className="text-muted-foreground">
                  {source.status}
                  {typeof source.latency_ms === 'number' ? ` · ${source.latency_ms} ms` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {verdict.unknowns.length > 0 && (
        <div className="rounded-lg border border-border/70 bg-background/40 p-2 text-xs text-muted-foreground">
          {verdict.unknowns.map((u) => (
            <p key={u.id}>{u.reason}</p>
          ))}
        </div>
      )}

      {policy.recommendHardwareSigner && (
        <div className="rounded-lg border border-border/70 bg-background/40 p-2 text-xs flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <p>A hardware-backed signer is recommended for this transaction because risk is elevated and device posture is degraded.</p>
        </div>
      )}

      {onAskAdvisor && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onAskAdvisor}
            className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ask Advisor About This Transaction
          </button>
        </div>
      )}
    </div>
  );
}
