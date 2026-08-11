// src/lib/useBackupNag.js — thin React wrapper over backupNag (Slice G+H §1/§4).
//
// Mount alone MUST NOT call markBackupNagShown — the sheet would otherwise
// racily mark itself "shown" on the same render it decides to appear, killing
// the very cadence read that spawned it. See useBackupNag.test.jsx.

import { useSyncExternalStore, useMemo } from 'react';
import {
  subscribe,
  shouldShowBackupNag,
  dismissForSession,
  markBackupNagShown,
} from '@/lib/backupNag';

export function useBackupNag(publicAddresses) {
  // Stable getSnapshot per address array identity — the array is normally a
  // fresh reference each render (WalletProvider derives it), so include a
  // string key in the deps to keep useSyncExternalStore's compare cheap.
  const key = Array.isArray(publicAddresses) ? publicAddresses.join(',') : '';
  // Depend on `key` (a stable serialisation of publicAddresses) rather than
  // the array identity so the snapshot function is stable across renders that
  // pass a new-but-equivalent addr array. Same address set → same key → same
  // snapshot identity → useSyncExternalStore doesn't churn.
  const getSnapshot = useMemo(
    () => () => shouldShowBackupNag(publicAddresses),
    [key, publicAddresses],
  );
  const shouldShow = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return {
    shouldShow,
    dismissForSession,
    promoteToCompleted: markBackupNagShown,
    markBackupNagShown,
  };
}
