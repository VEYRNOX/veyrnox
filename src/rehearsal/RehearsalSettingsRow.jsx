// src/rehearsal/RehearsalSettingsRow.jsx — entry point (build brief §4).
//
// A single ordinary Settings row that opens the rehearsal as an in-place overlay
// over the current (already-unlocked) session. NO new route is introduced (the
// /landing lesson: nothing publicly reachable). The row must read as ordinary —
// no wallet/set count, no multi-set hint, no "decoy" wording (brief §7) — so its
// mere presence discloses nothing about cardinality.

import { useState } from 'react';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import RehearsalView from './RehearsalView.jsx';

export default function RehearsalSettingsRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full p-5 rounded-xl border border-border bg-card flex items-center justify-between gap-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Rehearse deniability</p>
            <p className="text-xs text-muted-foreground">
              See the dashboard exactly as someone holding your unlocked phone would.
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      {open && <RehearsalView onClose={() => setOpen(false)} />}
    </>
  );
}
