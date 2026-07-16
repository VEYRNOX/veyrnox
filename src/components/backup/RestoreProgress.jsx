// @ts-nocheck
// components/backup/RestoreProgress.jsx
//
// ── ANIMATION SEAM ───────────────────────────────────────────────────────────
// This is the ISOLATED, self-contained "restoring your wallet" progress state that
// RestoreFromFile renders while the Argon2id decrypt / re-wrap runs (phase ===
// 'restoring'). It is deliberately factored out as its own component so a follow-up
// task can drop a richer ANIMATION in here without touching the restore state
// machine or its security-load-bearing gating. Keep this boundary clean: PURE
// PRESENTATION — no wallet handle, no crypto, no props that carry secrets.
//
// The only prop is `method` ('password' | 'pin'), used solely to pick honest copy
// for which phase of the restore is running. Nothing here branches on wallet-set
// identity (I3).

import { Loader2 } from 'lucide-react';

export default function RestoreProgress({ method = 'password' }) {
  return (
    <div
      data-testid="restore-progress"
      className="p-6 rounded-2xl border border-border bg-card text-center space-y-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex justify-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Restoring your wallet</p>
        <p className="text-xs text-muted-foreground">
          {method === 'pin'
            ? 'Opening your backup and re-encrypting it on this device…'
            : 'Opening your backup and unlocking it on this device…'}
        </p>
      </div>
    </div>
  );
}
