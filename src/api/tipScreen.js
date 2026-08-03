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
 * @param {{ chain: string, actionType: string, from: string, to: string, contractAddress?: string, calldata?: string, valueWei?: string }} params
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
    });

    // M-4 — I5, the backend is untrusted, and that includes its SHAPE. The catch
    // below only fires on thrown errors (network, non-2xx, abort, bad JSON
    // syntax). A response that parses but does not match the contract used to
    // flow through as a success, and s9TipThreat scores an unrecognised verdict
    // as OK — so a backend regression or schema drift read as "no threat".
    // Anything unrecognised degrades to the 'error' verdict, which the caller
    // already maps to CAUTION.
    if (!isWellFormedScreenResult(result)) {
      if (import.meta.env.DEV) console.error('[TIP] unrecognised screen response shape');
      return unavailableResult();
    }

    const signals = Array.isArray(result.risk_data?.threat_signals)
      ? result.risk_data.threat_signals
      : [];

    return {
      verdict: result.verdict,
      level: verdictToRiskLevel(result.verdict),
      risks: signalsToRiskRows(signals),
      signals,
      // Strict boolean: a truthy non-boolean must not become a sanctions hit,
      // and a non-boolean must never be carried through as-is.
      sanctions: result.risk_data?.sanctions_hit === true,
      raw: result,
    };
  } catch (err) {
    // I4 fail closed: a TIP error returns CAUTION, never a silent pass.
    if (import.meta.env.DEV) console.error('[TIP] screenTransaction error:', err);
    return unavailableResult();
  }
}

// The only verdicts the client will act on. Anything else — absent, renamed,
// a future value this build predates, or attacker-supplied — is not trusted.
const KNOWN_VERDICTS = Object.freeze(['allow', 'warn', 'block']);

function isWellFormedScreenResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (typeof result.verdict !== 'string') return false;
  if (!KNOWN_VERDICTS.includes(result.verdict)) return false;
  const rd = result.risk_data;
  // risk_data may be absent (a clean allow carries no detail), but if present it
  // must be an object we can read fields off.
  if (rd != null && (typeof rd !== 'object' || Array.isArray(rd))) return false;
  return true;
}

// The single CAUTION-level result used for every "screening did not give us a
// usable answer" path — thrown error and unrecognised shape alike. One shape so
// the two cannot drift apart.
function unavailableResult() {
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
