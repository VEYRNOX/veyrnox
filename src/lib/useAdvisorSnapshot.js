// src/lib/useAdvisorSnapshot.js
//
// Small hook wrapper around publishAdvisorContext for pages that want to
// hand Vigil (the Security Advisor) their non-secret on-screen state.
//
// I3 — snapshot is dropped whenever a deniability or demo session is
// active. Callers do not need to re-check; this hook is the chokepoint.
// Never put addresses, balances, seed/PIN/key material, or transaction
// signatures into a snapshot. Shell state only.
//
// Usage:
//   useAdvisorSnapshot({ page: { count: rows.length, filter } });
// Cleanup on unmount clears the shared context so a later page does not
// see stale data.

import { useEffect } from 'react';
import { publishAdvisorContext } from './advisorBridge';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

export function useAdvisorSnapshot(snapshot) {
  const serialized = safeStringify(snapshot);
  useEffect(() => {
    let deniable = true; // fail-closed on throw (I3)
    try { deniable = isDeniabilityOrDemoActive(); } catch { deniable = true; }
    if (deniable) {
      publishAdvisorContext(null);
      return undefined;
    }
    publishAdvisorContext(snapshot);
    return () => publishAdvisorContext(null);
  }, [serialized]);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
