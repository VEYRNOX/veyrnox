// src/components/RiskVerdictBanner.jsx
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// The ONE authoritative pre-sign verdict, rendered at the verify step.
// Presentational only: it renders whatever score() returned and owns no risk
// logic. Design system: one sentence, one token color (INFO/CAUTION/RISK),
// verifiable values in IBM Plex Mono truncated-middle, and a destructive-confirm
// ("Sign anyway") that appears ONLY after the sentence on RISK. Deniability (I3):
// the banner is structurally identical for a real or decoy set — same chrome,
// same copy logic; nothing here reads or reveals which set is active.

import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';

// Truncate the middle of a long 0x address so it stays verifiable but compact
// (per the design system, truncate-middle is for addresses). Non-address values
// (ENS names, wei amounts) are shown whole — truncating a number would destroy
// the precision that makes it verifiable.
const truncMiddle = (s) => {
  if (typeof s !== 'string') return s;
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

// Map a composite level to its design-system token + icon. OK renders nothing.
const STYLES = {
  INFO:    { box: 'bg-info/10 border-info/30',       text: 'text-info',    Icon: Info },
  CAUTION: { box: 'bg-caution/10 border-caution/30', text: 'text-caution', Icon: AlertTriangle },
  RISK:    { box: 'bg-risk/10 border-risk/40',       text: 'text-risk',    Icon: ShieldAlert },
};

export default function RiskVerdictBanner({ verdict, acknowledged = false, onAcknowledge }) {
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
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${style.box}`}>
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 mt-0.5 ${style.text}`} />
      <div className={`text-xs space-y-1.5 min-w-0 ${style.text}`}>
        <p className="font-medium">{verdict.sentence}</p>
        {monoEntries.length > 0 && (
          <div className="space-y-0.5">
            {monoEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 min-w-0">
                <span className="uppercase tracking-wide opacity-70 text-[10px] shrink-0">{k}</span>
                <span className="mono-value truncate" title={v}>{truncMiddle(v)}</span>
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
            />
            <span>I understand the risk and want to sign anyway.</span>
          </label>
        )}
      </div>
    </div>
  );
}
