// src/hooks/useBackgroundSecurity.js
//
// Starts the two background security services once the wallet is unlocked, and
// tears them down when it locks or the shell unmounts.
//
// This hook is the ONLY caller of startMonitor()/initPhishingFeed(). Both
// modules are deliberately callable-but-inert on their own; without a wiring
// point they do nothing, which is how they previously shipped described as
// running features while nothing started them. Keep that in mind before
// removing this hook: deleting the call site silently turns two catalogued
// capabilities off without any test going red.
//
// Data sources are the SAME local entity stores the pages already read
// (TokenApproval, Transaction) — no new backend surface, no new egress. The
// approval monitor is a local diff over rows the app has already fetched.

import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { initPhishingFeed } from '@/risk/phishingFeed';
import { startMonitor, stopMonitor } from '@/lib/approvalMonitor';
import { clearRiskNoteCache } from '@/lib/approvalRiskNotes';
import { useTier } from '@/lib/TierProvider';
import { hasAdvisorOnlineAccess } from '@/lib/tier';

async function fetchApprovals() {
  const rows = await base44.entities.TokenApproval.list();
  return Array.isArray(rows) ? rows : [];
}

async function fetchRecentTransfers() {
  const rows = await base44.entities.Transaction.list('-created_date', 100);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((t) => t && t.type === 'receive' && t.from_address)
    .map((t) => ({ from: t.from_address, symbol: t.currency, value: t.amount }));
}

/**
 * @param {boolean} enabled - start only once the wallet is actually unlocked.
 *   Before unlock there is nothing to monitor and the entity stores are empty.
 */
export function useBackgroundSecurity(enabled) {
  const { currentTier } = useTier();
  const advisorOnline = hasAdvisorOnlineAccess(currentTier);
  useEffect(() => {
    // I3: a decoy/demo session starts nothing. The modules gate themselves too
    // (the poll clears its own alerts, the feed lookup returns null), but not
    // arming them at all is the cheaper and more obvious guarantee.
    if (!enabled || isDeniabilityOrDemoActive()) {
      // Not just "don't start": drop anything a previous real session left in
      // memory, so a decoy opened in the same page lifetime reads nothing.
      stopMonitor();
      clearRiskNoteCache();
      return undefined;
    }

    // AI Security Protection tier gate — continuously updated threat intel
    // is an upsell capability. Free + Safety Plus skip the phishing feed
    // hydrate; approval monitor still runs (local-only, no egress).
    if (advisorOnline) {
      initPhishingFeed().catch(() => {
        // Feed unavailable → dApp screening continues on the local seed (I4).
      });
    }
    startMonitor({ fetchApprovals, fetchRecentTransfers });

    // Alerts and risk notes both name real counterparties, so locking must not
    // leave them readable. stopMonitor clears the alert store itself.
    return () => {
      stopMonitor();
      clearRiskNoteCache();
    };
  }, [enabled, advisorOnline]);
}
