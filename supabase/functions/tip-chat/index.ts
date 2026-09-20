// supabase/functions/tip-chat/index.ts
//
// Supabase Edge Function: forwards Security Advisor chat requests to the TIP
// backend's /api/v1/chat endpoint and streams the SSE response back to the
// caller unchanged.
//
// ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// The wallet's SecurityAdvisor.jsx wants a conversational AI grounded in
// current-screen context. That endpoint lives at
// `${TIP_BASE_URL}/api/v1/chat` — a Server-Sent Events stream from Llama-3.1-8B
// on Cloudflare Workers AI. The wallet was pointed at `tip-screen` instead,
// which is the ADDRESS SCREENING proxy — different shape, different response.
// Every Advisor turn was hitting that endpoint and getting rejected with
// "Missing required fields: request_id, chain, action_type, from_address,
// to_address". This function was written as the missing counterpart to
// `tip-screen`.
//
// That is why it was WRITTEN. It is not how the Advisor works — the proxy
// approach was abandoned in the same PR that built it. See the STATUS block at
// the bottom of this header before assuming anything here is on a live path.
//
// ─── AUTH POSTURE, HONESTLY ─────────────────────────────────────────────────
//
// TIP's /api/v1/chat is unauthenticated at the protocol level — no HMAC. The
// endpoint enforces a per-device-ID quota (30 turns / 24h) via a KV counter,
// and returns 402 Payment Required past that. So this proxy does not need to
// hold TIP credentials; it just forwards. The Supabase anon-key check below is
// the same gate `tip-screen` describes: it stops unkeyed drive-by traffic,
// nothing more (there is no user account, so "authentication" is a misnomer).
//
// ─── STREAMING ──────────────────────────────────────────────────────────────
//
// TIP responds with Content-Type: text/event-stream. Deno's fetch gives us a
// ReadableStream body; we return it directly on the Response so tokens reach
// the client as they arrive, without a full-buffer round trip.
//
// ─── DEPLOY ─────────────────────────────────────────────────────────────────
//
//   supabase functions deploy tip-chat
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL     — auto-injected
//   TIP_BASE_URL     — same value tip-screen uses (e.g. https://veyrnox-tip.al-jobson.workers.dev)
//   ALLOWED_ORIGINS  — optional, comma-separated extra browser origins
//   REVENUECAT_SECRET_KEY (or the older REVENUECAT_V1_SECRET_KEY, which now
//                    holds a v2 `sk_` key despite its name) — entitlement gate
//   REVENUECAT_PROJECT_ID — required by the v2 entitlement lookup; when it is
//                    unset the gate denies every request
//
// ─── STATUS: BUILT, WIRED, DEPLOY REQUIRED ──────────────────────────────────
//
// SecurityAdvisor.jsx calls this function. Direct browser -> Worker calls
// stopped working when the Worker began requiring header presence to
// distinguish API from bot traffic (401 to plain fetches). This proxy
// injects X-Api-Key server-side so Cloudflare treats requests as API,
// not bot. tipEdge.chatRoute.test.js pins the wiring both ways: this
// header must state WIRED, and SecurityAdvisor.jsx must reference
// functions/v1/tip-chat.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TIP_TIMEOUT_MS = 60_000; // longer than tip-screen (chat can stream for a while)
const MAX_BODY_BYTES = 128 * 1024; // Advisor prompts + history can grow past screen's 64K cap

// Per-message bounds, salvaged from PR #1592 (closed as superseded — its
// premise about why the Advisor went offline was wrong, but this part was right
// and had no equivalent anywhere in the tree).
//
// MAX_BODY_BYTES alone is not sufficient. 128 KB is one body, but it can be
// 128 KB of ten thousand tiny messages, or one message with a role the upstream
// model treats as an instruction. The body cap bounds bandwidth; these bound
// what the LLM is actually asked to do.
const MAX_CHAT_MESSAGES = 40;
// User/assistant messages stay tight — those come from the input box or the
// LLM response and rarely need more than a few KB.
const MAX_USER_CONTENT = 8192;
// System messages carry the Advisor's contextual knowledge base + weekly
// vendor advisories block, which routinely runs 12-20 KB. Cap high enough to
// fit that but well under the Llama-3.1-8B ~24K-token context window.
const MAX_SYSTEM_CONTENT = 32768;
const ENTITLEMENT_CACHE_TTL_MS = 60_000;
// Negative verdicts are cached too, on a SHORTER clock.
//
// Without this, only the `ok` path cached, so every unentitled or unknown id
// re-hit RevenueCat — and the id is an unauthenticated request header, so an
// outbound RevenueCat call per inbound request is something any caller could
// drive. That is our own API quota, spent by someone else, at their rate.
//
// Short because this is the side that costs a real subscriber: someone who
// purchases mid-session waits at most this long for the gate to notice. 10s is
// invisible to them and still collapses a probing flood by orders of magnitude.
const ENTITLEMENT_NEG_CACHE_TTL_MS = 10_000;
const REVENUECAT_TIMEOUT_MS = 3_000;
const REQUIRED_ENTITLEMENT = 'ai_security_protection';
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v2';
// Resolved lookup_key -> entitlement id, cached for the isolate's lifetime.
// Entitlement ids are stable for the life of the entitlement, so unlike the
// per-customer verdicts below this needs no TTL; it is only ever populated
// from a successful lookup, so a failure re-resolves next time.
let resolvedEntitlementId: string | null = null;
// Caching a caller-supplied key makes the map itself a target — unbounded, it
// is a memory sink fed by whoever sends the most distinct ids. Cleared wholesale
// rather than evicted LRU: the map is a latency optimisation, so the worst a
// flush can do is make the next request per id pay for a lookup it would have
// paid for anyway.
const MAX_ENTITLEMENT_CACHE_ENTRIES = 5_000;
const entitlementCache = new Map<string, { ok: boolean, expiresAt: number }>();

function rememberEntitlement(appUserId: string, ok: boolean): void {
  if (entitlementCache.size >= MAX_ENTITLEMENT_CACHE_ENTRIES) entitlementCache.clear();
  entitlementCache.set(appUserId, {
    ok,
    expiresAt: Date.now() + (ok ? ENTITLEMENT_CACHE_TTL_MS : ENTITLEMENT_NEG_CACHE_TTL_MS),
  });
}

// X-Rc-User-Id is an IDENTIFIER, not a credential: nothing binds the caller to
// the id they claim, so possession of someone's RevenueCat app_user_id is
// enough to use their entitlement. Anonymous RC ids are high-entropy
// (`$RCAnonymousID:<32 hex>`) so they are not enumerable, and upstream still
// applies its own per-device_id cap, which bounds what a stolen id is worth.
// Do not read this gate as authentication — closing it properly needs a
// server-authored proof (a signed RC-webhook token), which does not exist yet.
//
// What IS enforced here: the value reaches a URL path segment, so it is bounded
// and screened before use. RevenueCat caps app_user_id at 1500 chars. A control
// character is rejected outright rather than stripped — fetch() would throw on
// it anyway, and a 500 is a worse answer than a clean 403. Deliberately the same
// rule as safeRcUserId() in functions/api/edge/[fn].js, which screens the same
// header on the proxy route; this function is ALSO reachable directly
// (SecurityAdvisor's LEGACY_TIP_CHAT_URL), so it cannot rely on that one.
const MAX_RC_USER_ID = 1500;

function safeRcUserId(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_RC_USER_ID) return null;
  if (/[\u0000-\u001F\u007F]/.test(v)) return null;
  return v;
}

// Kept identical to tip-screen so both proxies accept the same set of origins.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'https://veyrnox-prod.pages.dev',
  'https://veyrnox-staging.pages.dev',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:5173',
  'http://localhost:5199',
];

function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rc-user-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins().has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// The entitlement lookup runs against RevenueCat API **v2**, not v1.
//
// It was written against v1 and could never have returned true, for two
// independent reasons, both measured against a live subscriber on 2026-09-20
// (a promotional grant of ai_security_protection, confirmed active in the
// RevenueCat dashboard):
//
//  1. The key it is given is a v2-generation `sk_` secret. v1 rejects those
//     outright: `403 {"code":7723,"message":"You're trying to use a secret API
//     key incompatible with RevenueCat API V1."}`. Every lookup took the
//     `!resp.ok` branch. RevenueCat no longer issues v1 keys, so this is not
//     fixable by swapping the secret.
//  2. It read `subscriber.entitlements.active`. The v1 REST subscriber has no
//     such sub-object — `entitlements` is a flat map keyed by identifier, and
//     `.active` belongs to the SDK's CustomerInfo. Even with a valid v1 key the
//     result would have been undefined.
//
// Both failure modes are silent and deny access, so the gate read as "working"
// while locking out every paying subscriber. Do not "simplify" this back to a
// single v1 call.
//
// v2 needs the project id, which v1 did not, hence REVENUECAT_PROJECT_ID.
// Absent config denies (I4) rather than admitting everyone — so set the secret
// BEFORE deploying this to an environment that gates real subscribers.
async function resolveEntitlementId(secret: string, signal: AbortSignal): Promise<string | null> {
  if (resolvedEntitlementId) return resolvedEntitlementId;
  const projectId = Deno.env.get('REVENUECAT_PROJECT_ID') ?? '';
  if (!projectId) return null;
  // v2 identifies entitlements by an opaque id (`entl...`), while this file —
  // and the store configuration, and the paywall — speak the lookup_key. The
  // list is short and the mapping is stable, so resolve it once rather than
  // pinning an opaque id in config where it could drift silently.
  const resp = await fetch(`${REVENUECAT_API_BASE}/projects/${encodeURIComponent(projectId)}/entitlements`, {
    headers: { 'Authorization': `Bearer ${secret}` },
    signal,
  });
  if (!resp.ok) return null;
  const body = await resp.json().catch(() => null) as Record<string, unknown> | null;
  const items = Array.isArray(body?.items) ? body.items as Record<string, unknown>[] : [];
  const match = items.find((i) => i && i.lookup_key === REQUIRED_ENTITLEMENT);
  const id = match && typeof match.id === 'string' ? match.id : null;
  if (id) resolvedEntitlementId = id;
  return id;
}

async function hasRequiredEntitlement(appUserId: string): Promise<boolean> {
  const now = Date.now();
  const cached = entitlementCache.get(appUserId);
  if (cached && cached.expiresAt > now) return cached.ok;

  const secret = Deno.env.get('REVENUECAT_SECRET_KEY')
    || Deno.env.get('REVENUECAT_V1_SECRET_KEY')
    || '';
  if (!secret) return false;
  const projectId = Deno.env.get('REVENUECAT_PROJECT_ID') ?? '';
  if (!projectId) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVENUECAT_TIMEOUT_MS);
  try {
    const entitlementId = await resolveEntitlementId(secret, controller.signal);
    // A failure to resolve is a configuration or outage problem, not a verdict
    // about this caller, so it is never cached.
    if (!entitlementId) return false;

    const resp = await fetch(
      `${REVENUECAT_API_BASE}/projects/${encodeURIComponent(projectId)}`
      + `/customers/${encodeURIComponent(appUserId)}/active_entitlements`,
      {
        headers: { 'Authorization': `Bearer ${secret}` },
        signal: controller.signal,
      },
    );
    if (!resp.ok) {
      // ONLY a 404 is a verdict about this customer: RevenueCat has never seen
      // the id. Every other status is a fact about US, and filing it in a
      // per-customer cache records the wrong thing about the wrong party.
      //
      // This mattered in practice. The V1 key incompatibility that #2663 fixed
      // answered 403 code 7723 on every single call, and this line filed each
      // one as "this subscriber is not entitled" — a wholly misconfigured gate
      // wearing the costume of a correct denial. A 429 has the same shape and
      // is worse live: ten seconds of RevenueCat throttling us becomes ten
      // seconds of every paying subscriber being unentitled.
      //
      // A 5xx was already excluded for exactly this reason; this widens the
      // rule to the rest of the statuses that are not about the customer.
      if (resp.status === 404) rememberEntitlement(appUserId, false);
      return false;
    }
    // Read as text and parse here, rather than `resp.json().catch(() => null)`.
    //
    // That form collapsed "RevenueCat says this customer has nothing" and "we
    // could not read what RevenueCat said" into the same null, and the cache
    // write below then recorded it as a denial. Measured on staging
    // 2026-09-20: the gate denied a genuinely entitled subscriber when requests
    // arrived in a burst and admitted the same subscriber when they were
    // spaced — the hardest symptom in this function to reason about, precisely
    // because the failure erased its own evidence.
    //
    // So an unreadable 2xx is not cached, and it is logged. Three separate
    // defects in this gate have now presented as the same silent 403; the log
    // line is what stops the fourth one doing the same.
    const text = await resp.text().catch(() => null);
    let body: unknown = null;
    try {
      body = typeof text === 'string' ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      console.error(
        `[tip-chat] entitlement lookup: unreadable ${resp.status} body `
        + `(${text === null ? 'unread' : `${text.length} chars`})`,
      );
      return false;
    }
    const rawItems = (body as Record<string, unknown>).items;
    const items = Array.isArray(rawItems) ? rawItems as Record<string, unknown>[] : [];
    // This endpoint returns ACTIVE entitlements only, so presence is access.
    // expires_at is still checked when present: it costs one comparison and
    // makes a stale or clock-skewed page fail closed rather than open.
    // Pagination is not followed on purpose — the project has two entitlements
    // in total, so a match cannot fall off the first page. Revisit if that
    // stops being true.
    const ok = items.some((i) => {
      if (!i || i.entitlement_id !== entitlementId) return false;
      const expiresAt = i.expires_at;
      if (expiresAt === null || expiresAt === undefined) return true;
      return typeof expiresAt === 'number' && expiresAt > Date.now();
    });
    rememberEntitlement(appUserId, ok);
    return ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // Same posture as tip-screen: presence of the Supabase anon key is the gate.
  // Not user authentication; keeps unkeyed drive-by traffic out.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  if (!bearer && !apikey) {
    return json({ error: 'unauthorized' }, 401, origin);
  }
  const rcUserId = safeRcUserId(req.headers.get('x-rc-user-id'));
  if (!rcUserId) {
    return json({ error: 'entitlement_required' }, 403, origin);
  }
  if (!(await hasRequiredEntitlement(rcUserId))) {
    return json({ error: 'entitlement_required' }, 403, origin);
  }

  // TIP_CHAT_BASE_URL overrides TIP_BASE_URL for the chat route only.
  // Prod uses this to route /api/v1/chat via the workers.dev bypass URL —
  // CF Bot Fight on the veyrnox.com zone challenges /api/v1/chat calls from
  // Supabase Deno IPs specifically on that path. tip-screen keeps using
  // TIP_BASE_URL and the zone WAF.
  const tipBaseUrl = Deno.env.get('TIP_CHAT_BASE_URL') || Deno.env.get('TIP_BASE_URL');
  if (!tipBaseUrl) {
    // I4: a misconfigured proxy must not look like a healthy Advisor. The
    // client renders "AI advisor unavailable" on a non-2xx.
    return json({ error: 'tip_not_configured' }, 503, origin);
  }

  // Read the body once so we can size-cap it, then forward unchanged.
  let raw: string;
  try {
    raw = await req.text();
    // Codex P2 2026-08-15: `.length` counts UTF-16 code units, not bytes. A
    // multibyte-heavy body can slip past a byte-oriented cap. Measure bytes.
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin);
    // Shape-check: must be an object with a non-empty messages array.
    // Codex P1 2026-08-15: device_id is caller-controlled, and upstream treats
    // a 'vault:' prefix as a signal to bypass the free-tier cap. There is NO
    // client-side entitlement proof today — the earlier "vault: subscribers
    // eventually prefix this" plan (SecurityAdvisor.jsx comment) never shipped
    // — so any 'vault:' prefix arriving here is unauthorised. Strip the
    // privileged prefix at the proxy; force free tier until a real entitlement
    // check (signed RC-webhook token) lands. Fail closed (I4).
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    if (typeof parsed.device_id === 'string' && parsed.device_id.startsWith('vault:')) {
      parsed.device_id = parsed.device_id.slice('vault:'.length);
      raw = JSON.stringify(parsed);
    }
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return json({ error: 'messages_required' }, 400, origin);
    }

    // Rejects the whole request rather than filtering bad entries out. Silently
    // dropping messages would change the conversation the caller believes it
    // sent, and a truncated history is a worse input to a security advisor than
    // an honest 400 (I4).
    if (parsed.messages.length > MAX_CHAT_MESSAGES) {
      return json({ error: 'too_many_messages' }, 400, origin);
    }
    for (const m of parsed.messages) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) {
        return json({ error: 'bad_message' }, 400, origin);
      }
      const { role, content } = m as Record<string, unknown>;
      // Allowlist, not denylist: an unrecognised role is the interesting case,
      // since upstream may assign meaning to one this build has never heard of.
      if (role !== 'system' && role !== 'user' && role !== 'assistant') {
        return json({ error: 'bad_message_role' }, 400, origin);
      }
      // Empty content is rejected upstream with a 400 anyway; catching it here
      // turns a confusing upstream failure into a precise one.
      if (typeof content !== 'string' || content.length === 0) {
        return json({ error: 'bad_message_content' }, 400, origin);
      }
      const cap = role === 'system' ? MAX_SYSTEM_CONTENT : MAX_USER_CONTENT;
      if (content.length > cap) {
        return json({ error: 'message_too_long' }, 400, origin);
      }
    }
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }

  // /api/v1/chat now requires HMAC per veyrnox-tip PR #48 (57c9bed) — the
  // unauthenticated posture noted in the header above is obsolete. Canonical
  // string is ts.METHOD.pathname.body per the same PR.
  const tipApiKey = Deno.env.get('TIP_API_KEY') ?? '';
  const tipSigningSecret = Deno.env.get('TIP_SIGNING_SECRET') ?? '';
  if (!tipApiKey || !tipSigningSecret) {
    return json({ error: 'tip_not_configured' }, 503, origin);
  }
  const endpoint = '/api/v1/chat';
  const ts = Math.floor(Date.now() / 1000).toString();
  const keySecret = await hmacHex(await sha256Hex(tipApiKey), tipSigningSecret);
  const sig = await hmacHex(`${ts}.POST.${endpoint}.${raw}`, keySecret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIP_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${tipBaseUrl.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'veyrnox-tip-chat-proxy/1.0',
        'X-Api-Key': tipApiKey,
        'X-Timestamp': ts,
        'X-Signature': sig,
      },
      body: raw,
      signal: controller.signal,
    });

    // 402 Payment Required — Advisor cap hit. Relay it through with the JSON
    // body so the wallet UX can show the correct upgrade prompt (Vault).
    if (upstream.status === 402) {
      const body = await upstream.text();
      return new Response(body, {
        status: 402,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (!upstream.ok) {
      // Generic to the caller, full detail to the Deno log.
      //
      // This branch shipped relaying upstream's status, content-type and 500
      // chars of its body to whoever called, under a comment that called itself
      // temporary ("Revert to generic 502 once diagnosed"). A `// TEMP` comment
      // is not a control: nothing expires it, and no check fails while it
      // survives. It outlived the diagnosis it was added for.
      //
      // The detail is not lost — `ref` correlates a user-visible error with the
      // log line holding everything. Same shape as
      // functions/api/buy/session.js `upstreamErr()`, which removed this exact
      // pattern in #1605 five commits before it was introduced here in #1614.
      //
      // Note the 402 branch ABOVE deliberately still relays its body: that is
      // the Advisor cap, whose JSON drives the upgrade prompt, so the client
      // genuinely needs it. Pinned by a test so a future sweep does not take
      // the cap UX with it.
      const ref = crypto.randomUUID().slice(0, 8);
      const detail = await upstream.text().catch(() => '');
      console.error(
        `[tip-chat] upstream ${upstream.status} ref=${ref} `
        + `ct=${upstream.headers.get('content-type') ?? ''} `
        + `body=${detail.slice(0, 500)}`,
      );
      return json({ error: 'tip_upstream_error', ref }, 502, origin);
    }

    // A 200 is not proof of an SSE stream, and this is not hypothetical: on
    // 2026-09-20 staging's upstream answered `200 text/html` with a Cloudflare
    // Access sign-in page, which this branch streamed to the client verbatim.
    // The client sets offline=false on a 2xx and then reads HTML as tokens, so
    // a login wall renders as a working Advisor — the exact shape of the
    // 2026-08-23 Turnstile outage, except that one at least failed with a 502.
    //
    // An interstitial always answers 200 with an HTML body, so status alone
    // cannot detect it; the content type is what distinguishes a stream from a
    // challenge. Anything that is not an event stream is treated as an upstream
    // failure and fails closed (I4), with the detail going to the log under the
    // same `ref` as the branch above.
    const upstreamType = upstream.headers.get('Content-Type') ?? '';
    if (!upstreamType.toLowerCase().includes('text/event-stream')) {
      const ref = crypto.randomUUID().slice(0, 8);
      const detail = await upstream.text().catch(() => '');
      console.error(
        `[tip-chat] upstream 200 but non-stream ref=${ref} `
        + `ct=${upstreamType} `
        + `body=${detail.slice(0, 500)}`,
      );
      return json({ error: 'tip_upstream_error', ref }, 502, origin);
    }

    // Stream the SSE body straight through. Preserve Content-Type so the
    // browser's EventSource / streaming fetch reader keeps working.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        // Guarded just above, so use the value that was checked instead of
        // re-reading the header and re-applying the default — that default is
        // what dressed a Cloudflare Access page up as a token stream.
        'Content-Type': upstreamType,
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return json({ error: 'tip_timeout' }, 504, origin);
    }
    return json({ error: 'tip_unreachable' }, 502, origin);
  } finally {
    clearTimeout(timer);
  }
});
