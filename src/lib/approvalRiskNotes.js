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

import { screenTransaction } from '@/api/tipScreen';
import { lookupThreatSync } from '@/lib/threatIntelStore';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

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

  // Local threat intel — instant, no network. Returns Array of matches;
  // take the first if any.
  const localHits = lookupThreatSync(spender);
  const localHit = localHits.length > 0 ? localHits[0] : null;
  if (localHit) {
    const note = {
      note: `Flagged: ${localHit.note || localHit.category}. ${severityAdvice(localHit.severity)}`,
      severity: localHit.severity === 'critical' ? 'high' : localHit.severity || 'medium',
      source: 'local-threat-intel',
    };
    _cache.set(key, note);
    return note;
  }

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

  return fetchRiskNote(spender, chain, key);
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
