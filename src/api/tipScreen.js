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

function getClient() {
  if (_client) return _client;

  const apiKey = import.meta.env.VITE_TIP_API_KEY;
  const signingSecret = import.meta.env.VITE_TIP_SIGNING_SECRET;
  const baseUrl = import.meta.env.VITE_TIP_BASE_URL;

  if (!apiKey || !signingSecret || !baseUrl) return null;

  _client = createTipClient({ apiKey, signingSecret, baseUrl });
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
