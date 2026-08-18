// src/hooks/useApprovalMonitor.js
//
// React view over the background approval monitor's alert store.
//
// getAlerts is passed as the snapshot AND the server snapshot on purpose: it
// returns the store's own array by reference, which is what useSyncExternalStore
// requires. It must keep doing so — a version that returns a copy (`[...alerts]`)
// compares unequal under Object.is on every render and spins React into an
// infinite loop. src/lib/__tests__/approvalMonitor.test.js pins that contract.

import { useSyncExternalStore, useCallback, useMemo } from 'react';
import { subscribeAlerts, getAlerts, dismissAlert, clearAlerts } from '@/lib/approvalMonitor';

export function useApprovalMonitor() {
  const alerts = useSyncExternalStore(subscribeAlerts, getAlerts, getAlerts);
  const highCount = useMemo(
    () => alerts.filter((a) => a.severity === 'high').length,
    [alerts],
  );
  return {
    alerts,
    dismiss: useCallback((id) => dismissAlert(id), []),
    clearAll: useCallback(() => clearAlerts(), []),
    highCount,
    totalCount: alerts.length,
  };
}
