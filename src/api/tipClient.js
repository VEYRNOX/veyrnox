// @ts-nocheck
// TIP Client SDK — talks to the Veyrnox-hosted signing proxy, never to TIP
// directly.
//
// Audit 2026-08-03 H-4. This module used to hold the TIP HMAC signing secret and
// derive the per-key secret in the browser:
//
//   keySecret = HMAC(signingSecret, sha256(apiKey))
//
// with `signingSecret` read from import.meta.env.VITE_TIP_SIGNING_SECRET. Vite
// statically inlines every VITE_-prefixed variable into the built bundle — web
// and the Capacitor app alike — and the identifier-renaming obfuscation in
// vite.config.js does not hide string literals. An HMAC scheme whose verifying
// secret is shipped to the caller authenticates nothing: anyone who unpacks the
// bundle can forge a validly-signed request. Per the TIP backend's own review
// (F1), that secret is also the root from which every tenant's per-key secret is
// derived, so re-deriving it client-side inverted the whole mitigation.
//
// Signing now happens in supabase/functions/tip-screen, which holds TIP_API_KEY
// and TIP_SIGNING_SECRET as server-side secrets. The client sends an UNSIGNED
// request to that proxy with the Supabase anon key, exactly like every other
// Supabase call in this app.
//
// Nothing leaked: VITE_TIP_* was never set in .env.example, .env.staging or CI,
// so the feature has been inert in every build. This is the architecture landing
// before the endpoint is provisioned rather than after.

export function createTipClient({ proxyUrl, anonKey, timeout = 10_000 }) {
  if (!proxyUrl || !anonKey) {
    throw new Error('tipClient: proxyUrl and anonKey are required');
  }

  const url = proxyUrl.replace(/\/$/, '');

  async function proxyFetch(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The Supabase anon key is PUBLIC by design — it is the same bar every
          // other RPC in this app sits behind, and it is not authentication.
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function screen(params) {
    // request_id is assigned SERVER-side now. It used to be built here with
    // Math.random(), which this project's own rules forbid for anything
    // security-relevant, and it is one less caller-controlled field reaching TIP.
    const body = {
      chain: params.chain,
      action_type: params.action_type,
      from_address: params.from_address,
      to_address: params.to_address,
      ...(params.value_wei && { value_wei: params.value_wei }),
      ...(params.contract_address && { contract_address: params.contract_address }),
      ...(params.token_address && { token_address: params.token_address }),
      ...(params.calldata && { calldata: params.calldata }),
      ...(params.metadata && { metadata: params.metadata }),
    };

    const resp = await proxyFetch(body);

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
      const err = new Error(errBody.error || `TIP screen failed: ${resp.status}`);
      err.status = resp.status;
      err.body = errBody;
      throw err;
    }

    return resp.json();
  }

  // chat() and health() lived here and were dead code — nothing in the app ever
  // called either (SecurityAdvisor does its own inline fetch). They pointed at
  // the TIP host directly, so leaving them after the proxy move would have left
  // two functions silently aimed at the wrong origin. Removed rather than
  // rewired: an unused code path is not worth the footgun.
  return { screen };
}

export function verdictToRiskLevel(verdict) {
  switch (verdict) {
    case 'block': return 'high';
    case 'warn': return 'medium';
    case 'allow': return 'info';
    // M-4 — an unrecognised verdict is NOT informational. This defaulted to
    // 'info', so a renamed/absent/unknown verdict rendered as benign in the UI
    // while s9 separately scored it OK. Both defaults are now cautionary.
    default: return 'medium';
  }
}

export function signalsToRiskRows(signals) {
  if (!signals || signals.length === 0) return [];
  return signals.map(s => ({
    level: s.risk_level === 'critical' ? 'high' : s.risk_level,
    title: s.signal_type.replace(/_/g, ' '),
    detail: `Source: ${s.source} · Confidence: ${Math.round(s.confidence * 100)}%`,
    value: s.value,
  }));
}

export function requiresAcknowledgment(verdict) {
  return verdict === 'block' || verdict === 'warn';
}
