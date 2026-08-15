// @ts-nocheck
// src/pages/AuditLog.jsx
//
// Local Audit Log viewer — opt-in, primary-session only. PROVISIONAL.
//
// AUDIT STATUS. Independent third-party audit (ECC, 2026-06-23) explicitly
// scoped this feature and passed it with zero findings: "All 8 catalogue
// claims verified against source; write path confirmed; no exaggeration of
// scope" (docs/audit-triage/ecc-independent-audit-2026-06-23.md). Still
// PROVISIONAL / BUILT — an audit pass is not the same as "verified"; there is
// no on-chain artifact to verify for a local log feature.
//
// SCOPE. Reads at most 100 entries ({ type, ts } ONLY — no amounts, addresses,
// or wallet identity) from the AES-GCM encrypted 'quaternary' vault blob.
// The three loggable event types: settings_changed, approval_revoked, send_completed.
//
// PRIVACY GUARANTEES (inherited from wallet-core/auditLog.js):
//   • Off by default — a non-user leaves zero artifact.
//   • No-op in decoy/hidden sessions (readAuditLogEntries returns [] there).
//   • Panic wipe destroys the blob for free (clears the whole vault store).
//   • Only { type, ts } stored — no amounts, recipients, addresses, or which-wallet.
//
// IMPORT CONSTRAINT. This page never imports auditLog.js directly — it reaches
// the log only through WalletProvider context (readAuditLogEntries,
// clearAuditLogEntries, auditLogEnabled, toggleAuditLog). This is enforced by
// src/__tests__/audit-log-honest-disabled.test.js.

import { useState, useEffect, useCallback } from 'react';
import { Shield, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useWallet } from '@/lib/WalletProvider';

const EVENT_LABELS = {
  settings_changed: 'Settings changed',
  approval_revoked: 'Approval revoked',
  send_completed: 'Send completed',
};

export default function AuditLog() {
  const {
    auditLogEnabled,
    // Branch review 2026-08-15 (A-1). Default true so a caller that renders
    // this page without the flag behaves as the primary session — this governs
    // only the aria annotation, never the write itself. The real gate lives in
    // WalletProvider.toggleAuditLog and cannot be bypassed from here.
    auditLogWritable = true,
    toggleAuditLog,
    readAuditLogEntries,
    clearAuditLogEntries,
  } = useWallet();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!auditLogEnabled) { setEntries([]); return; }
    setLoading(true);
    try {
      const data = await readAuditLogEntries();
      setEntries(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [auditLogEnabled, readAuditLogEntries]);

  useEffect(() => { reload(); }, [reload]);

  const handleClear = async () => {
    await clearAuditLogEntries();
    setEntries([]);
  };

  // Newest first for display.
  const displayEntries = [...entries].reverse();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl border border-border bg-card">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Optional encrypted local activity record — primary session only
            </p>
          </div>
        </div>
      </div>

      {/* Enable / disable toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">Enable audit log</p>
              <p id="audit-log-toggle-help" className="text-sm text-muted-foreground max-w-sm">
                Off by default. Logs 100 events: type + time only, no amounts or addresses. Disabled in decoy/hidden sessions.
              </p>
            </div>
            {/* A-1 (branch review 2026-08-15). In a decoy/hidden session
                toggleAuditLog refuses and `auditLogEnabled` never changes, so
                the switch simply does not move. Sighted users have the sentence
                above; a screen-reader user tabbing straight to the control got
                silence and no indication the action was refused.

                aria-disabled, NOT disabled: a hard-disabled control is removed
                from the tab order and reads as unavailable, which is a LOUDER
                deniability tell than an unresponsive one. This keeps the
                control reachable and announces the already-disclosed reason. */}
            <Switch
              checked={auditLogEnabled}
              onCheckedChange={toggleAuditLog}
              aria-label="Enable audit log"
              aria-disabled={!auditLogWritable || undefined}
              aria-describedby="audit-log-toggle-help"
            />
          </div>

          {/* AL-06 (2026-07-05 internal audit) — honest disclosure of the
              primary-session-only design. Rendered whenever the toggle is on,
              regardless of whether entries exist yet. Calm, muted-foreground
              tone — an accepted design limitation, not an active alarm. See
              src/wallet-core/auditLog.js:145 (auditSecretForSession → null in
              decoy/hidden sessions). */}
          {auditLogEnabled && (
            <p
              data-testid="audit-log-deniability-disclosure"
              className="text-xs text-muted-foreground leading-relaxed mt-4 pt-4 border-t border-border"
            >
              <span className="font-medium text-foreground">Deniability note.</span>{' '}
              Logs only your primary session. Decoy/hidden sessions aren't logged — by design. But absence of a log could signal a hidden wallet. Panic wipe clears everything.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Log entries — only visible when enabled */}
      {auditLogEnabled && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Recent events
              {entries.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({entries.length} / 100)
                </span>
              )}
            </CardTitle>
            {entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClear}>
                Clear
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
            ) : displayEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No events recorded yet. Enable the log and perform an action to see entries.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayEntries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">
                        {EVENT_LABELS[e.type] ?? e.type}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(e.ts).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scope note */}
      <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
        <p>Entries: {'{type, ts}'} only, no amounts or addresses.</p>
        <p>Storage: encrypted in primary vault. Panic wipe clears it.</p>
        <p>Loggable events: settings_changed · approval_revoked · send_completed.</p>
      </div>
    </div>
  );
}
