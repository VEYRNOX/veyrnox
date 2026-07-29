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
import { uuidv4, randomIntBetween, randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

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
// Require the operator to opt in via an explicit staging marker.
if (!/staging|preview|localhost|127\.0\.0\.1/i.test(SUPABASE_URL)) {
  fail(
    'SUPABASE_URL does not look like staging. ' +
      'Set SUPABASE_URL to a staging/preview/local Supabase host, ' +
      'or add the host to PROD_HOSTS and remove this guard deliberately.'
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
    record_attribution:     { ...profiles[PROFILE], exec: 'recordAttribution',    tags: { rpc: 'record_attribution' } },
  },
  thresholds: {
    // Global — anything above these fails CI.
    http_req_failed:              ['rate<0.02'],       // <2% transport errors
    http_req_duration:            ['p(95)<800'],       // p95 under 800 ms
    'checks{kind:accepted}':      ['rate>0.98'],       // RPC accepted OR expected-rate-limit
    // Per-RPC latency budgets.
    'http_req_duration{rpc:track_event}':            ['p(95)<400'],
    'http_req_duration{rpc:generate_referral_code}': ['p(95)<600'],
    'http_req_duration{rpc:register_referral_code}': ['p(95)<600'],
    'http_req_duration{rpc:increment_referral}':     ['p(95)<600'],
    'http_req_duration{rpc:record_attribution}':     ['p(95)<600'],
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

// ---------- scenarios: exec functions ----------

const EVENT_TYPES = [
  'app_open',
  'wallet_created',
  'wallet_unlocked',
  'receive_viewed',
  'send_completed',
  'plan_viewed',
  'plan_purchased',
];

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

export function registerReferralCode() {
  const code = ('K6' + randomString(6)).toUpperCase();
  callRpc('register_referral_code', { p_code: code, p_device_id: deviceId() });
  sleep(randomIntBetween(2, 5));
}

export function incrementReferral() {
  const code = ('K6' + randomString(6)).toUpperCase();
  callRpc('increment_referral', { p_code: code, p_device_id: deviceId() });
  sleep(randomIntBetween(2, 5));
}

export function recordAttribution() {
  const code = ('K6' + randomString(6)).toUpperCase();
  callRpc('record_attribution', {
    p_code: code,
    p_plan: Math.random() < 0.5 ? 'monthly' : 'annual',
    p_revenue_cents: randomIntBetween(500, 5000),
    p_discount_cents: 0,
  });
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
