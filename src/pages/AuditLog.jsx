// src/pages/AuditLog.jsx
//
// Local Audit Log viewer — opt-in, primary-session only. UNAUDITED-PROVISIONAL.
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
        <span className="shrink-0 px-2.5 py-1 rounded-md border border-caution/40 text-caution font-mono text-xs">
          UNAUDITED-PROVISIONAL
        </span>
      </div>

      {/* Enable / disable toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">Enable audit log</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Off by default. When on, logs up to 100 timestamped events
                (type + time only — no amounts, addresses, or wallet identity).
                No-op in decoy / hidden sessions.
              </p>
            </div>
            <Switch
              checked={auditLogEnabled}
              onCheckedChange={toggleAuditLog}
              aria-label="Enable audit log"
            />
          </div>
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
        <p>Entries contain only {{ type, ts }} — no amounts, recipients, addresses, or wallet identity.</p>
        <p>Storage: AES-GCM encrypted blob in the primary vault store. Panic wipe destroys it.</p>
        <p>Loggable events: settings_changed · approval_revoked · send_completed.</p>
      </div>
    </div>
  );
}
