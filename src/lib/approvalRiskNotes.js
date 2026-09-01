// src/lib/approvalRiskNotes.js
//
// Per-approval AI risk notes — feeds each spender address through the TIP
// screening pipeline and caches a one-sentence risk note per spender.
//
// Reuses the existing tipScreen + threatIntelStore infrastructure.
// Notes are cached in-memory per session (no persistence — stale notes
// are worse than no notes). A cache miss triggers a background fetch;
// the UI renders a placeholder until it resolves.
//
// I3: suppressed in deniability/demo — returns null (no egress).
// I4: a failed lookup returns a cautious "could not assess" note, never
//     "this spender is safe" (no false negatives from errors).
// I2: uses the same tip-screen proxy as pre-send screening — no new
//     network surface.
//
// TIER: "Drainer & unsafe DEX warnings" is sold as an AI Security Protection
// capability, and the REMOTE screen is what that gate buys. The LOCAL
// threat-intel hit is not gated: it costs nothing, makes no network call, and
// its data already ships in the app. Suppressing it would leave a free user
// approving a spender we already know is a drainer, with silence — which reads
// as safe (I4). Same split useBackgroundSecurity.js applies: the phishing-feed
// hydrate is tier-gated, the local seed keeps serving every tier.

import { screenTransaction } from '@/api/tipScreen';
import { lookupThreatSync } from '@/lib/threatIntelStore';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { hasAdvisorOnlineAccessCached } from '@/lib/tierCache';

const _cache = new Map();
const _inflight = new Map();

/**
 * Generate a risk note for a spender address. Returns immediately from
 * cache if available; otherwise kicks off a background fetch and returns
 * null (caller should re-query on state change).
 *
 * @param {string} spender - spender address
 * @param {string} [chain='evm'] - chain identifier
 * @returns {{ note: string, severity: 'high'|'medium'|'low'|'unknown', source: string } | null}
 */
export function getRiskNote(spender, chain = 'evm') {
  if (!spender) return null;
  // I3: a decoy session gets nothing — not a cached note from the real session,
  // and no background fetch. fetchRiskNote gates the egress too; this is the
  // read-side half, and it must be here rather than only at the call site.
  if (isDeniabilityOrDemoActive()) return null;
  const key = `${chain}:${spender}`.toLowerCase();

  if (_cache.has(key)) return _cache.get(key);

  // Local threat intel — every tier, before the tier gate. See the TIER note
  // in the header.
  const local = localNote(spender, key);
  if (local) return local;

  // Remote TIP screen is the paid half.
  if (!hasAdvisorOnlineAccessCached()) return null;

  // Kick off remote fetch if not already in flight.
  if (!_inflight.has(key)) {
    _inflight.set(key, fetchRiskNote(spender, chain, key));
  }

  return null;
}

/**
 * Subscribe-friendly: returns a promise that resolves when the note for
 * this spender is ready. For use with React Query or similar.
 */
export async function fetchRiskNoteAsync(spender, chain = 'evm') {
  if (!spender) return null;
  // Returns BEFORE the cache read: notes are keyed by real spender addresses,
  // so a decoy session must not be able to read one the real session cached.
  if (isDeniabilityOrDemoActive()) return null;

  const key = `${chain}:${spender}`.toLowerCase();
  if (_cache.has(key)) return _cache.get(key);

  // Same order as getRiskNote(): local intel for every tier, remote screen
  // for the AI tier only. This path is the one TokenApprovals actually calls,
  // and before this it never consulted the local store at all — the local
  // branch existed only in getRiskNote(), which has no callers.
  const local = localNote(spender, key);
  if (local) return local;

  if (!hasAdvisorOnlineAccessCached()) return null;

  return fetchRiskNote(spender, chain, key);
}

/**
 * Local threat-intel hit for a spender, or null. No network, no tier gate.
 * Caches under the same key as a remote note so the two paths cannot disagree
 * within a session; lookupThreatSync self-suppresses in deniability/demo.
 */
function localNote(spender, key) {
  const localHits = lookupThreatSync(spender);
  const localHit = localHits.length > 0 ? localHits[0] : null;
  if (!localHit) return null;
  const note = {
    note: `Flagged: ${localHit.note || localHit.category}. ${severityAdvice(localHit.severity)}`,
    severity: localHit.severity === 'critical' ? 'high' : localHit.severity || 'medium',
    source: 'local-threat-intel',
  };
  _cache.set(key, note);
  return note;
}

async function fetchRiskNote(spender, chain, key) {
  if (isDeniabilityOrDemoActive()) {
    _inflight.delete(key);
    return null;
  }

  try {
    // sourcesConsulted is populated at runtime by tipScreen but not in its
    // declared @returns shape; cast to any so downstream reads type-check.
    /** @type {any} */
    const result = await screenTransaction({
      chain,
      actionType: 'approval_check',
      from: '0x0000000000000000000000000000000000000000',
      to: spender,
    });

    let note;
    if (!result) {
      note = {
        note: 'Risk assessment unavailable for this address.',
        severity: 'unknown',
        source: 'unavailable',
      };
    } else if (result.verdict === 'block') {
      note = {
        note: `High risk: ${result.risks?.[0]?.title || 'flagged by threat intelligence'}. Consider revoking this approval.`,
        severity: 'high',
        source: result.sourcesConsulted?.[0]?.source || 'tip-screen',
      };
    } else if (result.verdict === 'warn') {
      note = {
        note: `Caution: ${result.risks?.[0]?.title || 'potential risk detected'}. Review this approval.`,
        severity: 'medium',
        source: result.sourcesConsulted?.[0]?.source || 'tip-screen',
      };
    } else if (result.sanctions) {
      note = {
        note: 'Sanctioned address. Revoke this approval immediately.',
        severity: 'high',
        source: 'sanctions-list',
      };
    } else {
      note = {
        note: 'No known threats from consulted sources. Absence does not guarantee safety.',
        severity: 'low',
        source: result.sourcesConsulted?.[0]?.source || 'tip-screen',
      };
    }

    _cache.set(key, note);
    _inflight.delete(key);
    return note;
  } catch {
    const fallback = {
      note: 'Could not assess this spender. Proceed with caution.',
      severity: 'unknown',
      source: 'error',
    };
    _cache.set(key, fallback);
    _inflight.delete(key);
    return fallback;
  }
}

function severityAdvice(severity) {
  if (severity === 'critical') return 'Revoke this approval immediately.';
  if (severity === 'high') return 'Consider revoking this approval.';
  return 'Review this approval.';
}

export function clearRiskNoteCache() {
  _cache.clear();
  _inflight.clear();
}
