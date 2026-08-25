// @ts-nocheck
// components/onboarding/KdfMigrationSharesNudge.jsx
//
// Owner-ruled 2026-08-25 KDF profile v1→v2 flag flip
// (KDF_PROFILE_V2_MIGRATION_ENABLED in wallet-core/vault.js). The migration
// hook in keystore/native.js `_unlockInner` DEFERS rekey for any wallet that
// has active Personal Backup Shamir shares — rekeying invalidates them.
// This card surfaces the tradeoff so the user can regenerate shares before
// the migration is allowed to run.
//
// Rendering guards (all AND'd, mirroring FastUnlockFirstRunCard.jsx):
//   - Native Android — the migration path this nudge exists for is scoped
//     to native builds today (keystore/native.js), and the same UX plan
//     that shipped the flip.
//   - Pending marker present — the guard in native.js only writes
//     'veyrnox-kdf-migration-pending-shares-warning' when it actually
//     deferred a rekey. If the marker is absent, there is nothing to nudge.
//   - Not deniability/demo (I3) — the presence of the nudge itself is a
//     tell ("this device has active Personal Backup shares AND a pending
//     KDF migration"). A coerced session must never see it.
//   - Not dismissed — 'veyrnox-kdf-nudge-dismissed' respects "Not now"
//     until a panic-wipe.
//
// Both markers are in wallet-core/panic.js METADATA_RESIDUE_KEYS; see the
// panic-residue-kdf-migration test for the sweep contract.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { KeyRound } from 'lucide-react';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  NUDGE_PENDING_KEY,
  NUDGE_DISMISSED_KEY,
} from '@/wallet-core/keystore/kdfMigrationGuard';

const GATE_LOADING = 0;
const GATE_HIDE = 1;
const GATE_SHOW = 2;

function readGate() {
  try {
    if (Capacitor.getPlatform?.() !== 'android') return GATE_HIDE;
    if (isDeniabilityOrDemoActive()) return GATE_HIDE;
    if (localStorage.getItem(NUDGE_DISMISSED_KEY) !== null) return GATE_HIDE;
    if (localStorage.getItem(NUDGE_PENDING_KEY) === null) return GATE_HIDE;
    return GATE_SHOW;
  } catch {
    return GATE_HIDE;
  }
}

export default function KdfMigrationSharesNudge() {
  const [gate, setGate] = useState(GATE_LOADING);
  const navigate = useNavigate();

  useEffect(() => { setGate(readGate()); }, []);

  if (gate !== GATE_SHOW) return null;

  const guardedRegenerate = () => {
    // Belt-and-braces at click time. Same three-writer discipline as
    // FastUnlockFirstRunCard: never write to shared markers from a decoy
    // flip that happened between mount and click.
    if (isDeniabilityOrDemoActive()) { setGate(GATE_HIDE); return; }
    setGate(GATE_HIDE);
    navigate('/personal-backup');
  };
  const guardedNotNow = () => {
    if (isDeniabilityOrDemoActive()) { setGate(GATE_HIDE); return; }
    try { localStorage.setItem(NUDGE_DISMISSED_KEY, '1'); } catch { /* non-fatal */ }
    setGate(GATE_HIDE);
  };

  return (
    <div
      data-testid="kdf-migration-shares-nudge"
      role="dialog"
      aria-modal="false"
      aria-labelledby="kdf-migration-shares-nudge-title"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg p-4"
    >
      <div className="rounded-xl border border-border bg-card shadow-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h3 id="kdf-migration-shares-nudge-title" className="font-semibold text-sm">
              Faster unlock is available
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Enabling it will rotate your vault&rsquo;s encryption keys, which
              invalidates your current Personal Backup shares. Regenerate your
              shares in Settings &rarr; Personal Backup first, then this nudge
              will disappear on next unlock.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            data-testid="kdf-migration-shares-nudge-not-now"
            onClick={guardedNotNow}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted"
          >
            Not now
          </button>
          <button
            type="button"
            data-testid="kdf-migration-shares-nudge-regenerate"
            onClick={guardedRegenerate}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Regenerate shares
          </button>
        </div>
      </div>
    </div>
  );
}
