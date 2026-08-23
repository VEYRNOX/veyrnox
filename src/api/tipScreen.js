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
import { hydrateFromCache, lookupLocal } from '@/lib/localIocCache.js';
import { getRcUserId } from '@/lib/purchases';

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
    // Server-side Safety Plus paywall — tip-screen's Edge Function looks the
    // id up against RevenueCat and denies if the safety_plus entitlement is
    // absent or expired. Returns null on web / deniability / demo, which the
    // proxy treats as unentitled (fail-closed).
    getRcUserId,
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
export async function screenTransaction(params, { signal } = {}) {
  const inDeniability = isDeniabilityOrDemoActive();

  // Local IOC cache — checked FIRST (before any network egress). If we
  // have a signed manifest cached, an address hit here shortcuts the
  // network call entirely. In deniability mode, this is the ONLY path we
  // take — I3 forbids network egress but reading local IndexedDB does
  // not leak. Previously deniability mode meant zero screening; now known-
  // bad addresses still get flagged.
  const localHit = await tryLocalScreen(params, inDeniability);
  if (localHit) return localHit;

  // Deniability mode: no network fallback. Local-only. Absent local
  // match means "we couldn't screen this at all" — return null so the
  // caller's UI stays consistent with the pre-cache behaviour (Advisor
  // falls through to its local KB response path).
  if (inDeniability) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const result = await client.screen({
      chain: params.chain,
      // 2026-08-16 audit remediation: thread the caller signal through to
      // proxyFetch so a deniability activation can cancel this in flight.
      action_type: params.actionType,
      from_address: params.from,
      to_address: params.to,
      ...(params.contractAddress && { contract_address: params.contractAddress }),
      ...(params.calldata && { calldata: params.calldata }),
      ...(params.valueWei && { value_wei: params.valueWei }),
      // Solana + Bitcoin lanes on the Worker consume a base64/hex serialized
      // transaction; SendCrypto passes it here for chains that can build one
      // pre-sign (SOL today; BTC deferred — testmempoolaccept needs a
      // fully signed raw tx which we do not have pre-sign).
      ...(params.serializedTx && { serialized_tx: params.serializedTx }),
      ...(params.recentCounterparties?.length && { recent_counterparties: params.recentCounterparties }),
    }, { signal });

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

    // TIP now returns a per-source trace (sources_consulted[]) so the UI can
    // show WHICH threat sources answered vs. errored/skipped. Absence of a
    // source ≠ clean — see I4.
    const sourcesConsulted = Array.isArray(result.risk_data?.sources_consulted)
      ? result.risk_data.sources_consulted.filter(isWellFormedSource)
      : [];

    return {
      verdict: result.verdict,
      level: verdictToRiskLevel(result.verdict),
      risks: signalsToRiskRows(signals),
      signals,
      sourcesConsulted,
      // The engine's own "we couldn't screen this at all" message — carried
      // through verbatim so the UI can reason without inventing wording.
      verdictReason: typeof result.verdict_reason === 'string' ? result.verdict_reason : null,
      // Strict boolean: a truthy non-boolean must not become a sanctions hit.
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
// 'unknown' is the honest default when no threat source could screen the
// address (all skipped / errored). It renders as a CAUTION card telling the
// user to verify independently — never a green CLEAR tick (I4).
const KNOWN_VERDICTS = Object.freeze(['allow', 'warn', 'block', 'unknown']);

// SourceResult shape from TIP — one row per external source consulted. Kept
// strict because these render directly in the Advisor UI without further
// sanitisation.
const KNOWN_SOURCE_STATUSES = Object.freeze(['hit', 'clean', 'error', 'skipped']);
function isWellFormedSource(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (typeof row.source !== 'string' || row.source.length === 0) return false;
  if (!KNOWN_SOURCE_STATUSES.includes(row.status)) return false;
  if (typeof row.latency_ms !== 'number') return false;
  return true;
}

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

// Local-cache screening. Returns a full screening result object matching
// the network path's shape when the cached manifest has a hit for the
// address; returns null when the cache is empty, not hydrated, or the
// address isn't present.
//
// Called ahead of the network path in normal mode (fast-path shortcut) and
// as the ONLY path in deniability mode (I3 preserves zero network egress
// while still delivering useful screening for known-bad addresses).
async function tryLocalScreen(params, inDeniability) {
  // Hydrate on first call. In deniability mode this MUST be a local-only
  // op — hydrateFromCache reads IndexedDB, never the network.
  try {
    await hydrateFromCache();
  } catch {
    return null;
  }
  const entry = lookupLocal(params.to);
  if (!entry) return null;

  // Category → verdict + reason string. Matches the server-side
  // composeVerdict priority for the same categories: sanctions and hack
  // are hard-block; phishing is high-confidence block. We deliberately
  // don't emit a "warn" from local cache — the server-side aggregator
  // owns nuance decisions; we're just replaying its own conclusions.
  let reason;
  if (entry.cat === 'sanctions') {
    reason = `OFAC/sanctions match on list: ${entry.reason ?? 'OFAC-SDN'}`;
  } else if (entry.cat === 'hack') {
    reason = `Reported as ${entry.reason ?? 'hack participant'}`;
  } else {
    reason = `Reported by ${entry.src ?? 'phishing feed'}`;
  }

  // Single-source trace so the UI's Sources-consulted panel still renders.
  // The `[local]` prefix makes it visually distinct from the network
  // sources — the user can see the verdict came from the cached manifest,
  // not a live query. Especially important in deniability mode where the
  // network sources would otherwise be conspicuously absent.
  const sourcesConsulted = [{
    source: `${entry.src ?? 'local-cache'} [local]`,
    status: 'hit',
    latency_ms: 0,
    detail: reason,
  }];

  return {
    verdict: 'block',
    level: verdictToRiskLevel('block'),
    risks: [{
      level: 'high',
      title: reason,
      detail: inDeniability
        ? 'From local threat cache (offline / deniability mode).'
        : 'From local threat cache.',
    }],
    signals: [],
    sourcesConsulted,
    verdictReason: reason,
    sanctions: entry.cat === 'sanctions',
    raw: null,
  };
}
