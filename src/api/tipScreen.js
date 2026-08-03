// @ts-nocheck
// TIP remote screening — the single egress point for threat-intel lookups.
//
// I2: no silent egress — only called when the user has opted in (remoteScreen).
// I3: suppressed entirely in deniability/demo — zero backend calls.
// I4: fail closed on error — returns a CAUTION-level result, never silently allows.
// I5: backend untrusted — TIP verdicts feed INTO the local score() as one more
//     signal, they never override or bypass the composite gate.

import { createTipClient, verdictToRiskLevel, signalsToRiskRows } from './tipClient.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

let _client = null;

// H-4 — the TIP API key and signing secret are SERVER-side only, held by the
// tip-screen Edge Function. The client presents the Supabase anon key (public by
// design) exactly as every other Supabase call does.
//
// A VITE_-prefixed variable is statically inlined into the shipped bundle, so a
// signing secret read here would be handed to every user. If one is ever set
// again, refuse to build a client rather than quietly using it: that is the
// whole finding, and a comment alone would not have stopped it recurring.
function getClient() {
  if (_client) return _client;

  if (import.meta.env.VITE_TIP_SIGNING_SECRET || import.meta.env.VITE_TIP_API_KEY) {
    // Loud in dev, inert-but-safe in production: screening is simply disabled
    // rather than run with a bundled secret.
    if (import.meta.env.DEV) {
      console.error(
        '[TIP] VITE_TIP_SIGNING_SECRET / VITE_TIP_API_KEY must never be set — they ship in the '
        + 'client bundle. Configure TIP_SIGNING_SECRET and TIP_API_KEY as Edge Function secrets '
        + 'for supabase/functions/tip-screen instead. Screening is disabled.',
      );
    }
    return null;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  // Kept as the feature switch: screening stays off until an endpoint exists.
  const tipConfigured = import.meta.env.VITE_TIP_BASE_URL;

  if (!supabaseUrl || !anonKey || !tipConfigured) return null;

  _client = createTipClient({
    proxyUrl: `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/tip-screen`,
    anonKey,
  });
  return _client;
}

/**
 * Screen a transaction against TIP's threat-intel engine.
 *
 * @param {{ chain: string, actionType: string, from: string, to: string, contractAddress?: string, calldata?: string, valueWei?: string, recentCounterparties?: string[] }} params
 * @returns {Promise<{ verdict: string, level: string, risks: Array, signals: Array, sanctions: boolean, raw: object } | null>}
 *   null when screening is unavailable or suppressed (deniability/demo/unconfigured).
 */
export async function screenTransaction(params) {
  if (isDeniabilityOrDemoActive()) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const result = await client.screen({
      chain: params.chain,
      action_type: params.actionType,
      from_address: params.from,
      to_address: params.to,
      ...(params.contractAddress && { contract_address: params.contractAddress }),
      ...(params.calldata && { calldata: params.calldata }),
      ...(params.valueWei && { value_wei: params.valueWei }),
      ...(params.recentCounterparties?.length && { recent_counterparties: params.recentCounterparties }),
    });

    return {
      verdict: result.verdict,
      level: verdictToRiskLevel(result.verdict),
      risks: signalsToRiskRows(result.risk_data?.threat_signals || []),
      signals: result.risk_data?.threat_signals || [],
      sanctions: result.risk_data?.sanctions_hit || false,
      raw: result,
    };
  } catch (err) {
    // I4 fail closed: a TIP error returns CAUTION, never a silent pass.
    if (import.meta.env.DEV) console.error('[TIP] screenTransaction error:', err);
    return {
      verdict: 'error',
      level: 'medium',
      risks: [{
        level: 'medium',
        title: 'threat screening unavailable',
        detail: 'Remote screening could not complete. Proceed with caution.',
      }],
      signals: [],
      sanctions: false,
      raw: null,
    };
  }
}
