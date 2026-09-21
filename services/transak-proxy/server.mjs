// services/transak-proxy/server.mjs
//
// WHY THIS EXISTS.
//
// Transak's Create Widget URL API requires partner calls to originate from
// whitelisted IPs: "Call this API only from the partner backend, with partner
// IPs whitelisted." (docs.transak.com/reference/create-widget-url)
//
// Our backend is Cloudflare Pages Functions, which egress from Cloudflare's
// shared edge — a different address per request, out of Cloudflare's whole
// global range. There is no static IP to register. An allowlist built from
// observed traffic passes verification on the day and then silently stops
// matching as routing shifts. That is what took prod Buy down on 2026-09-16
// after it had worked since launch: create-session began returning
// 401 invalid_api_key, indistinguishable from a bad key (issue #2655).
//
// This is a dumb relay that runs on a host WITH a static outbound IP. It adds
// nothing to the request except a stable source address. Deliberately minimal:
// zero dependencies, two allowlisted upstream paths, nothing else reachable.
//
// DEPLOY: any host with a static egress IP (Render, Fly.io with a dedicated
// IPv4, a VPS). Register that IP with Transak, set TRANSAK_PROXY_BASE on the
// Pages project to this service's origin, and redeploy Pages.
//
// SECURITY. This relay carries a header set that includes the Transak partner
// secret, so it must never be an open relay:
//   1. PROXY_SHARED_SECRET — constant-time compared. No secret, no service.
//   2. Only the two Transak paths below are forwardable. No wildcard, no
//      caller-supplied host, no path passthrough.
//   3. Request bodies are capped, and so are upstream response bodies.
// The Transak secret itself is NOT stored here — it arrives in the forwarded
// headers from the Pages Function, which already holds it. That keeps exactly
// one copy of the credential.

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET || '';
const MAX_BODY_BYTES = 64 * 1024;
// Transak's token and session responses are a few hundred bytes. The cap is
// generous for them and still stops a misbehaving upstream (or anything a
// redirect lands on) from making this small VM buffer an unbounded body.
export const MAX_RESPONSE_BYTES = 64 * 1024;

// The ONLY upstreams this relay will talk to. Keyed by the path the caller
// asks for, so a caller can never name a host.
const UPSTREAMS = new Map([
  ['/transak/refresh-token/staging',    'https://api-stg.transak.com/partners/api/v2/refresh-token'],
  ['/transak/refresh-token/production', 'https://api.transak.com/partners/api/v2/refresh-token'],
  ['/transak/session/staging',          'https://api-gateway-stg.transak.com/api/v2/auth/session'],
  ['/transak/session/production',       'https://api-gateway.transak.com/api/v2/auth/session'],
]);

// Headers forwarded verbatim. An allowlist, not a passthrough: forwarding
// whatever the caller sends would let it set Host, cookies, or anything else.
const FORWARD_HEADERS = ['content-type', 'accept', 'api-secret', 'x-api-key', 'x-user-ip', 'access-token', 'referer'];

function secretOk(given) {
  if (!SHARED_SECRET || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SHARED_SECRET);
  // timingSafeEqual throws on length mismatch, which itself leaks length —
  // compare padded buffers of equal size instead.
  const len = Math.max(a.length, b.length);
  return timingSafeEqual(Buffer.concat([a], len), Buffer.concat([b], len)) && a.length === b.length;
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Read an upstream fetch Response without buffering more than `maxBytes`.
 * Content-Length is a cheap early reject but is advisory (chunked responses
 * have none, and it can lie), so the count is enforced on the actual read.
 * Throws rather than truncating: a silently cut JSON body would be relayed as
 * a malformed success. Mirrors readCapped() in functions/api/_lib/upstream.js.
 * @param {Response} upstreamRes
 * @param {number} [maxBytes]
 * @returns {Promise<Buffer>}
 */
export async function readCappedResponse(upstreamRes, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(upstreamRes.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response too large');
  if (!upstreamRes.body) return Buffer.alloc(0);
  const reader = upstreamRes.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer(async (req, res) => {
  // Liveness, and a way to read this host's egress IP when registering it.
  if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true });

  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });

  const upstream = UPSTREAMS.get(req.url || '');
  if (!upstream) return send(res, 404, { error: 'unknown_route' });

  if (!secretOk(req.headers['x-proxy-secret'])) return send(res, 401, { error: 'unauthorized' });

  let body;
  try { body = await readBody(req); }
  catch { return send(res, 413, { error: 'body_too_large' }); }

  const headers = {};
  for (const h of FORWARD_HEADERS) {
    const v = req.headers[h];
    if (typeof v === 'string') headers[h] = v;
  }

  try {
    const upstreamRes = await fetch(upstream, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
    let payload;
    try { payload = await readCappedResponse(upstreamRes); }
    catch { return send(res, 502, { error: 'upstream_too_large' }); }
    res.writeHead(upstreamRes.status, {
      'content-type': upstreamRes.headers.get('content-type') || 'application/json',
      'content-length': payload.length,
    });
    res.end(payload);
  } catch (e) {
    // Never echo upstream internals; the Pages Function logs the detail.
    send(res, 502, { error: 'upstream_unreachable' });
  }
});

// Tests import this file for readCappedResponse; everything else (the VM's
// startup script) runs it as-is and must keep listening by default.
if (process.env.TRANSAK_PROXY_NO_LISTEN !== '1') {
  server.listen(PORT, () => console.log(`transak-proxy listening on ${PORT}`));
}
