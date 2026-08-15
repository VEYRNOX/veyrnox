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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Stream the SSE body straight through. Preserve Content-Type so the
    // browser's EventSource / streaming fetch reader keeps working.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
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
