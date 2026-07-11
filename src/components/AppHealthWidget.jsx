import { useState, useEffect } from 'react';
import { probeRuntimeServices, loadAuditSnapshot, readDeviceCapabilities } from '@/lib/appHealth';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession';

const STATUS_COLOR = {
  ok: 'text-success',
  degraded: 'text-caution',
  unreachable: 'text-destructive',
};

function StatusDot({ status }) {
  const color = status === 'ok' ? 'bg-success' : status === 'degraded' ? 'bg-caution' : 'bg-destructive';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />;
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}

function Row({ icon, label, right, status }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-sm text-foreground">
        {icon && <i className={`ti ${icon} text-muted-foreground`} aria-hidden="true" />}
        {label}
      </div>
      <span className={`text-xs font-mono ${STATUS_COLOR[status] ?? 'text-muted-foreground'}`}>
        {right}
      </span>
    </div>
  );
}

function Skeleton() {
  return <div className="h-4 w-24 rounded bg-muted animate-pulse" />;
}

function kekStatus(tier) {
  if (tier === 'unavailable') return 'degraded';
  return 'ok';
}

export default function AppHealthWidget() {
  const [services, setServices] = useState(null);
  const [audit, setAudit] = useState(null);
  const caps = readDeviceCapabilities();

  useEffect(() => {
    if (isDeniabilitySessionActive()) return;
    Promise.allSettled([
      probeRuntimeServices().then(setServices),
      loadAuditSnapshot().then(setAudit),
    ]);
  }, []);

  const issueCount =
    (services?.filter(s => s.status !== 'ok').length ?? 0) +
    (audit && !audit.unavailable ? (audit.critical + audit.high) : 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="ti ti-topology-star text-muted-foreground" aria-hidden="true" />
          <span className="font-medium text-sm">App dependencies</span>
        </div>
        {issueCount > 0 && (
          <span className="text-xs bg-caution/10 text-caution border border-caution/20 rounded px-2 py-0.5">
            {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      <div>
        <SectionLabel>Runtime services</SectionLabel>
        {services === null
          ? [1, 2, 3, 4].map(i => <div key={i} className="py-2"><Skeleton /></div>)
          : services.map(s => (
              <Row
                key={s.name}
                label={s.name}
                status={s.status}
                right={s.status === 'ok' && s.latencyMs != null ? `OK · ${s.latencyMs}ms` : s.status}
              />
            ))}
      </div>

      <div>
        <SectionLabel>Package security</SectionLabel>
        {audit === null ? (
          <div className="py-2"><Skeleton /></div>
        ) : audit.unavailable ? (
          <Row label="Audit snapshot" status="unreachable" right="unavailable" />
        ) : (
          <>
            <Row
              label={`${audit.total} total vulnerabilities`}
              status={audit.critical > 0 ? 'unreachable' : audit.high > 0 ? 'degraded' : 'ok'}
              right={audit.total === 0 ? 'clean' : `${audit.critical}C · ${audit.high}H`}
            />
            {audit.findings.filter(f => f.severity === 'critical' || f.severity === 'high').slice(0, 3).map(f => (
              <Row key={f.name} label={f.name} status={f.severity === 'critical' ? 'unreachable' : 'degraded'} right={f.severity} />
            ))}
          </>
        )}
      </div>

      <div>
        <SectionLabel>Device capabilities</SectionLabel>
        <Row label="Platform" status="ok" right={caps.platform} />
        <Row
          label="Hardware KEK"
          status={kekStatus(caps.kekTier)}
          right={caps.kekTier}
        />
        <Row
          label="RASP OS probe"
          status={caps.raspAvailable ? 'ok' : 'degraded'}
          right={caps.raspAvailable ? 'native (F-09)' : 'browser only'}
        />
        <Row
          label="Mainnet"
          status={caps.mainnet ? 'ok' : 'degraded'}
          right={caps.mainnet ? 'enabled' : 'testnet only'}
        />
      </div>
    </div>
  );
}
