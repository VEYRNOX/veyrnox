// @ts-nocheck
// src/components/bugReport/BugReportButton.jsx
//
// Slice 1b of the opt-in bug-report recording feature.
// Renders the "Report a problem" entry in Settings, gated on isBugReportEnabled().
//
// See docs/bug-report-recording-plan.md for the full design + slice plan.
//
// Behaviour today (Slice 1b):
//   - When the composed gate returns false, this component renders nothing.
//     The composed gate defaults FALSE (VITE_BUG_REPORT_ENABLED='1' required),
//     so on every current build this component is dead visual code — safe to
//     merge under the 1.0.1 submission hold.
//   - When the gate returns true, the button renders and, on tap, invokes the
//     supplied onStart callback. The state machine that consumes onStart lands
//     in Slice 1c — until then, callers pass a placeholder that opens a
//     "coming soon" sheet.
//
// The gate check happens on every render, not once at mount. A session that
// transitions into a decoy state mid-render (through a routing/context
// change) must not keep the button visible; re-evaluating on each render is
// the belt-and-braces guarantee.

import { Bug } from 'lucide-react';
import { isBugReportEnabled } from '@/lib/bugReport/bugReportEnabled';

export default function BugReportButton({ onStart }) {
  if (!isBugReportEnabled()) return null;

  return (
    <button
      type="button"
      onClick={onStart}
      data-testid="bug-report-button"
      className="w-full flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors min-h-[44px] text-start"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Report a problem</p>
          <p className="text-xs text-muted-foreground">
            Record a short clip of what went wrong to send to support
          </p>
        </div>
      </div>
      <span className="text-sm text-primary font-medium">Record</span>
    </button>
  );
}
