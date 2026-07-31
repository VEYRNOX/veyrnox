// k6 load test for Veyrnox's Supabase RPC surface.
//
// Targets ONLY the hardened SECURITY DEFINER RPCs the app already calls:
//   track_event, generate_referral_code, register_referral_code,
//   increment_referral, record_attribution.
//
// Refuses to run against prod (SUPABASE_URL must be an explicit staging host).
// Each VU mints its own device UUID so we exercise per-device rate limits
// (60/hr track_event, 1/device dedup on increment_referral, etc.) rather
// than trivially hitting one bucket.
//
// Run:  k6 run perf/supabase-rpcs.k6.js
// Env:  SUPABASE_URL, SUPABASE_ANON_KEY  (required)
//       PROFILE=smoke|load|soak          (default: smoke)

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { uuidv4, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ---------- config ----------

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const PROFILE = (__ENV.PROFILE || 'smoke').toLowerCase();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  fail('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

// Fail-closed guard: never point this at production.
// Add prod hosts here explicitly; anything matching is rejected.
const PROD_HOSTS = [
  // e.g. 'xxxxxxxx.supabase.co',
];
for (const h of PROD_HOSTS) {
  if (h && SUPABASE_URL.includes(h)) {
    fail(`refusing to load-test production host: ${h}`);
  }
}
// Two ways to be considered staging:
//   (a) URL contains staging|preview|localhost|127.0.0.1 (obvious naming).
//   (b) URL host substring is in STAGING_HOSTS_ALLOW env (comma-separated).
//       Needed for fresh Supabase projects whose auto-assigned refs don't
//       contain "staging" — the operator explicitly opts the host in.
const looksLikeStaging = /staging|preview|localhost|127\.0\.0\.1/i.test(SUPABASE_URL);
const allowedHosts = (__ENV.STAGING_HOSTS_ALLOW || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
const hostAllowed = allowedHosts.some((h) => SUPABASE_URL.includes(h));
if (!looksLikeStaging && !hostAllowed) {
  fail(
    'SUPABASE_URL does not look like staging. ' +
      'Either name the host so it contains staging/preview/localhost/127.0.0.1, ' +
      'or add its ref to STAGING_HOSTS_ALLOW env (comma-separated whitelist).'
  );
}

// ---------- scenarios ----------

const profiles = {
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '30s',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 25 },
      { duration: '3m', target: 25 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 10,
    duration: '30m',
  },
};

if (!profiles[PROFILE]) fail(`unknown PROFILE: ${PROFILE}`);

export const options = {
  scenarios: {
    track_event:            { ...profiles[PROFILE], exec: 'trackEvent',           tags: { rpc: 'track_event' } },
    generate_referral_code: { ...profiles[PROFILE], exec: 'generateReferralCode', tags: { rpc: 'generate_referral_code' } },
    register_referral_code: { ...profiles[PROFILE], exec: 'registerReferralCode', tags: { rpc: 'register_referral_code' } },
    increment_referral:     { ...profiles[PROFILE], exec: 'incrementReferral',    tags: { rpc: 'increment_referral' } },
    // record_attribution INTENTIONALLY OMITTED from the anon-key smoke rig
    // (issue #1495). The RPC was moved to service_role-only by H-3 (see
    // sql/api-security-hardening.sql) — the anon key can no longer reach it,
    // so any call here would 401/403 and fail the http_req_failed threshold.
    // Adding it back needs its own service_role-scoped profile on manual
    // dispatch only, documented in perf/README.md.
  },
  thresholds: {
    // Global — anything above these fails CI.
    http_req_failed:              ['rate<0.02'],       // <2% transport errors
    http_req_duration:            ['p(95)<800'],       // p95 under 800 ms
    'checks{kind:accepted}':      ['rate>0.98'],       // RPC accepted OR expected-rate-limit
    // Per-RPC latency budgets. Calibrated from smoke run 30438735062
    // (2 VUs × 30s against Supabase staging from an ubuntu-latest runner):
    // track_event measured p95 500ms → 700ms budget = measured + ~40%
    // network-variance headroom. Retighten once real user traffic gives
    // a lower ceiling.
    'http_req_duration{rpc:track_event}':            ['p(95)<700'],
    'http_req_duration{rpc:generate_referral_code}': ['p(95)<600'],
    'http_req_duration{rpc:register_referral_code}': ['p(95)<600'],
    'http_req_duration{rpc:increment_referral}':     ['p(95)<600'],
  },
};

// ---------- helpers ----------

const rpcLatency = new Trend('rpc_latency', true);
const rateLimited = new Rate('rate_limited');

function rpcUrl(name) {
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// Per-VU device id so we hit per-device rate-limit code paths instead of
// piling every VU onto one bucket. Rotates occasionally to keep the load fresh.
function deviceId() {
  if (!__ENV.STICKY_DEVICE || __ENV.STICKY_DEVICE === '0') return uuidv4();
  if (!globalThis.__veyrnoxDevice) globalThis.__veyrnoxDevice = uuidv4();
  return globalThis.__veyrnoxDevice;
}

// A 429 or a `RATE_LIMIT`-shaped 400 is an EXPECTED response under load,
// not a failure. We record it separately and count it as "accepted" so
// thresholds don't punish honest throttling.
function classify(res) {
  const ok = res.status >= 200 && res.status < 300;
  const throttled =
    res.status === 429 ||
    (res.status === 400 && /rate.?limit|too many|dedup/i.test(res.body || ''));
  rateLimited.add(throttled);
  rpcLatency.add(res.timings.duration, { rpc: res.request.url.split('/').pop() });
  return { ok, throttled };
}

function callRpc(name, body) {
  const res = http.post(rpcUrl(name), JSON.stringify(body), {
    headers: headers(),
    tags: { rpc: name },
  });
  const { ok, throttled } = classify(res);
  check(
    res,
    { [`${name}: accepted or throttled`]: () => ok || throttled },
    { kind: 'accepted', rpc: name }
  );
  return res;
}

// ---------- setup: seed a real referral-code pool ------------
//
// Before-fix (issue #1495): registerReferralCode / incrementReferral each
// generated a fresh `('K6' + randomString(6))` per iteration and called the
// RPC against a code that did not exist in the `referrals` table, so the
// RPCs (correctly) rejected them. Baseline showed ~45% http_req_failed —
// which meant a real regression on those two RPCs would be invisible under
// the noise.
//
// Fix: setup() runs ONCE before any VU starts, generates a small pool of
// REAL codes via generate_referral_code, and returns them. The two
// downstream scenarios pick a random code from the pool for each iteration.
// The pool is intentionally larger than any single-profile VU count so no
// scenario runs out; if fewer than half seed successfully, we abort loudly
// rather than silently under-testing.
//
// device-id caveat: generate_referral_code is rate-limited at 1 per device.
// Setup uses a fresh uuidv4() per call to sidestep that — this is a seeding
// operation, not the shape a real client makes. Runtime scenarios keep
// their existing deviceId()/STICKY_DEVICE behaviour untouched.

const POOL_SIZE = 30;

export function setup() {
  const codes = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const res = http.post(
      rpcUrl('generate_referral_code'),
      JSON.stringify({ p_device_id: uuidv4() }),
      { headers: headers() },
    );
    if (res.status < 200 || res.status >= 300) continue;
    // Supabase RPC endpoints return the SQL function's return value verbatim
    // as JSON: for `RETURNS TEXT` that's a bare JSON string ("K6ABC123"), for
    // a table-returning function it's an array/object. Accept both shapes so
    // this doesn't break if the SQL definition tightens later.
    try {
      const parsed = JSON.parse(res.body);
      if (typeof parsed === 'string' && parsed.length > 0) {
        codes.push(parsed);
      } else if (parsed && typeof parsed === 'object') {
        const c = parsed.code || parsed.p_code || parsed.referral_code;
        if (typeof c === 'string' && c.length > 0) codes.push(c);
      }
    } catch { /* malformed body — skip */ }
  }
  if (codes.length < Math.ceil(POOL_SIZE / 2)) {
    fail(
      `setup: only ${codes.length}/${POOL_SIZE} referral codes seeded — ` +
        'check generate_referral_code is deployed + reachable on this staging project.',
    );
  }
  return { codes };
}

// ---------- scenarios: exec functions ----------

// Must match src/lib/analytics.js EVENTS and whatever allowlist the target
// project enforces. Diagnostic run 30438516129 caught guessed names as
// "500 P0003 Unknown event"; these six are from the canonical file.
const EVENT_TYPES = [
  'first_open',
  'wallet_ready',
  'receive_address_viewed',
  'send_flow_started',
  'unlock_attempt',
  'consent_granted',
];

// Pick a random code from the setup()-seeded pool. Small helper because two
// scenarios share this shape and getting it wrong (e.g. off-by-one on the
// bound) silently biases the load toward one code.
function pickCode(data) {
  return data.codes[randomIntBetween(0, data.codes.length - 1)];
}

export function trackEvent() {
  const device = deviceId();
  callRpc('track_event', {
    p_device_id: device,
    p_event: EVENT_TYPES[randomIntBetween(0, EVENT_TYPES.length - 1)],
    p_metadata: { asset: 'ETH', k6: true },
  });
  sleep(randomIntBetween(1, 3));
}

export function generateReferralCode() {
  callRpc('generate_referral_code', { p_device_id: deviceId() });
  sleep(randomIntBetween(2, 5));
}

export function registerReferralCode(data) {
  // Use a real, existing code from the pool so the RPC exercises the actual
  // registration path (issue #1495). A fresh random string bypasses the
  // referrals-table existence check and fails at the wrong layer.
  callRpc('register_referral_code', { p_code: pickCode(data), p_device_id: deviceId() });
  sleep(randomIntBetween(2, 5));
}

export function incrementReferral(data) {
  // Same reasoning as registerReferralCode: real code, real code path.
  // Note: increment_referral dedups 1 per device per code — that means once
  // a VU's rotating deviceId happens to hit a code it already incremented
  // in this run, the RPC returns a shaped 400 (`dedup`) which classify()
  // counts as accepted-throttled, not failed. Correct behaviour to measure.
  callRpc('increment_referral', { p_code: pickCode(data), p_device_id: deviceId() });
  sleep(randomIntBetween(2, 5));
}

// ---------- summary ----------

export function handleSummary(data) {
  return {
    'perf/results/summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const line = (k, v) => `  ${k.padEnd(40)} ${v}`;
  const pct = (r) => (r == null ? 'n/a' : `${(r * 100).toFixed(2)}%`);
  return [
    '',
    `Veyrnox Supabase RPC load — profile=${PROFILE}`,
    line('http_req_failed',         pct(m.http_req_failed?.values?.rate)),
    line('http_req_duration p95',   `${m.http_req_duration?.values?.['p(95)']?.toFixed(1)} ms`),
    line('rate_limited (expected)', pct(m.rate_limited?.values?.rate)),
    line('checks accepted',         pct(m['checks{kind:accepted}']?.values?.rate)),
    '',
  ].join('\n');
}
