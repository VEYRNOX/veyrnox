// src/hooks/useApprovalMonitor.js
//
// React hook that exposes background approval monitor alerts.
// Thin wrapper around src/lib/approvalMonitor.js subscribeAlerts.

import { useSyncExternalStore, useCallback } from 'react';
import { subscribeAlerts, getAlerts, dismissAlert, clearAlerts } from '@/lib/approvalMonitor';

export function useApprovalMonitor() {
  const alerts = useSyncExternalStore(subscribeAlerts, getAlerts, getAlerts);
  return {
    alerts,
    dismiss: useCallback((ts) => dismissAlert(ts), []),
    clearAll: useCallback(() => clearAlerts(), []),
    highCount: alerts.filter(a => a.severity === 'high').length,
    totalCount: alerts.length,
  };
}
