// src/components/RiskVerdictBanner.jsx
//
// Risk Scoring v1 — PROVISIONAL — independent audit complete (ECC 2026-06-23,
// §24; pure on-device, fail-closed, never claims "safe" — no findings). Still
// BUILT, not 'verified'.
//
// The ONE authoritative pre-sign verdict, rendered at the verify step.
// Presentational only: it renders whatever score() returned and owns no risk
// logic. Design system: one sentence, one token color (INFO/CAUTION/RISK),
// verifiable values in IBM Plex Mono, and a destructive-confirm ("Sign anyway")
// that appears ONLY after the sentence on RISK. Deniability (I3): the banner is
// structurally identical for a real or decoy set — same chrome, same copy logic;
// nothing here reads or reveals which set is active.
//
// VALUES ARE SHOWN IN FULL, NEVER TRUNCATED. This banner is the point where the
// user VERIFIES the values, so they must be legible end-to-end. Truncate-middle
// is actively harmful here: address-poisoning look-alikes (S4) share the exact
// head+tail that a truncation keeps, so a 0xABCD…WXYZ render would collapse the
// recipient and the resembled address into identical strings — hiding the very
// nibbles the verdict tells the user to compare. Signals own human-readable
// evidence (e.g. S8 emits formatted amounts, not raw wei).

import { useId } from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import Spinner from '@/components/Spinner';

// Map a composite level to its design-system token + icon. OK renders nothing.
const STYLES = {
  INFO:    { box: 'bg-info/10 border-info/30',       text: 'text-info',    Icon: Info },
  CAUTION: { box: 'bg-caution/10 border-caution/30', text: 'text-caution', Icon: AlertTriangle },
  RISK:    { box: 'bg-risk/10 border-risk/40',       text: 'text-risk',    Icon: ShieldAlert },
};

export default function RiskVerdictBanner({ verdict, acknowledged = false, onAcknowledge, pending = false }) {
  const sentenceId = useId();
  // While the pre-sign checks are still running (e.g. the simulation's
  // eth_getCode is in flight), say so explicitly. The caller keeps the verify
  // buttons disabled until this resolves, so the user never proceeds against an
  // unknown verdict and then hits a bare fail-closed error at signing time.
  if (pending) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30"
      >
        <Spinner size="sm" className="shrink-0 mt-0.5" decorative />
        <p className="text-xs text-muted-foreground">Running pre-sign risk checks…</p>
      </div>
    );
  }

  if (!verdict || verdict.level === 'OK' || !verdict.sentence) return null;
  const style = STYLES[verdict.level];
  if (!style) return null;
  const { Icon } = style;
  const values = verdict.evidence?.values || {};
  // Only string evidence renders as a mono row. Array values (S6 dustInputs) and
  // other non-strings are intentionally skipped here — S6 is BTC-only and not yet
  // wired into send; revisit row rendering when it is.
  const monoEntries = Object.entries(values).filter(([, v]) => typeof v === 'string');

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 p-3 rounded-lg border ${style.box}`}
    >
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 mt-0.5 ${style.text}`} />
      <div className={`text-xs space-y-1.5 min-w-0 ${style.text}`}>
        <p id={sentenceId} className="font-medium">{verdict.sentence}</p>
        {monoEntries.length > 0 && (
          <div className="space-y-0.5">
            {monoEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 min-w-0">
                <span className="uppercase tracking-wide opacity-70 text-[10px] shrink-0">{k}</span>
                {/* Full value, wrapping — never truncated (see header note). */}
                <span className="mono-value break-all">{v}</span>
              </div>
            ))}
          </div>
        )}
        {verdict.requiresConfirmation && (
          <label className="flex items-start gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              onChange={(e) => onAcknowledge?.(e.target.checked)}
              aria-describedby={sentenceId}
            />
            <span>I understand the risk and want to sign anyway.</span>
          </label>
        )}
      </div>
    </div>
  );
}
