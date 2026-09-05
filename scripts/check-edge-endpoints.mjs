#!/usr/bin/env node
// scripts/check-edge-endpoints.mjs
//
// Synthetic check for the /api/data/* edge functions against a deployed origin.
//
// WHY THIS EXISTS. On 2026-08-06 /api/data/klines was returning 502 from
// production on every request — Binance blocks Cloudflare egress IPs — and
// nothing surfaced it. It was found by hand, long after the fact. Unit tests
// cannot catch this class of failure: the functions in functions/api/data/ are
// never executed by vitest, and a local `vite` dev server does not serve /api/*
// at all (there is no `wrangler pages dev` script). The only place these run is
// a real deployment, so that is where they have to be checked.
//
// Usage:
//   node scripts/check-edge-endpoints.mjs <base-url>
//   node scripts/check-edge-endpoints.mjs https://veyrnox-prod.pages.dev
//
// Exits non-zero if any REQUIRED check fails. Advisory checks report but do not
// fail the run — used for sources that are known-degraded upstream and are
// covered by a fallback, so the build does not go red for someone else's outage.
//
// GROUPS (added 2026-09-05). Some checks are alternative sources for the SAME
// user-visible capability. What matters for the chart is "at least one source
// serves candles", not "OKX specifically is up" — so those checks share a
// `group`, and the group fails the run only when EVERY member fails. A member
// that fails while a sibling succeeds is reported WARN: the degradation is
// visible in the log without blocking an unrelated merge.
//
// Why: `okx-candles` was REQUIRED on its own, so an OKX outage redded
// `staging-gate` — a required merge gate — on a repo merging 10+ times a day.
// It did so on 52e3e05f (2026-08-07), 35d85509 (2026-08-08), and twice on
// 2026-09-05, each time while `klines` and/or `coingecko` were serving the same
// data. Four upstream hiccups blocking unrelated PRs is the check reporting
// something other than what it exists to prove.
//
// This deliberately does NOT weaken the original purpose. The 2026-08-06
// incident this script was written for — /api/data/klines 502 on every request
// with nothing surfacing it — still fails the run, because back then every
// chart source was down. Group membership is only for interchangeable sources;
// a check that proves something no other check proves stays REQUIRED on its own
// (`okx-candles rejects a bad instId` is input validation, not a data source).

import { pathToFileURL } from 'node:url';

// Importing this module must have NO side effects — classifyResults is unit
// tested, and a module that parses argv and calls process.exit() at import time
// would kill the test runner instead. Everything below the guard runs only when
// the file is executed directly.
const IS_MAIN = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

const base = (process.argv[2] || '').replace(/\/$/, '');
if (IS_MAIN && !base) {
  console.error('usage: check-edge-endpoints.mjs <base-url>');
  process.exit(2);
}

const TIMEOUT_MS = 20_000;
// A Cloudflare Pages deployment is not routable the instant `wrangler pages
// deploy` returns: the static assets answer first and the Functions bind a
// moment later. Checking immediately produced a 404 on EVERY endpoint —
// including ones known-good on other URLs — and failed the deploy job for no
// real reason. Wait for the deployment to come up before asserting anything.
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 5_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until the Functions layer answers at all (any status other than 404).
 * Returns false if it never does — a genuine "functions did not deploy".
 */
async function waitForFunctions(probePath) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}${probePath}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      last = res.status;
      if (res.status !== 404) return true;
    } catch {
      // Not resolvable yet — keep waiting.
    }
    await sleep(READY_POLL_MS);
  }
  console.error(`Functions never became routable (last status ${last || 'no response'}) after ${READY_TIMEOUT_MS / 1000}s`);
  return false;
}

// Interchangeable sources for one capability: the price chart. Any one of them
// serving means the chart works.
const CHART_GROUP = 'chart-data';

/** @type {Array<{name:string,path:string,required?:boolean,group?:string,expectStatus?:number,check:(body:any,res:Response)=>string|null}>} */
const CHECKS = [
  {
    name: 'okx-candles (chart primary)',
    path: '/api/data/okx-candles?instId=BTC-USDT&bar=1H&limit=5',
    // Grouped, not individually required — see GROUPS in the header.
    group: CHART_GROUP,
    check: (b) => {
      if (b?.code !== '0') return `expected code "0", got ${JSON.stringify(b?.code)}`;
      if (!Array.isArray(b.data) || b.data.length === 0) return 'no candles returned';
      // Guard against a source that answers 200 with stale or malformed rows.
      const [ts, open] = b.data[0];
      if (!Number.isFinite(Number(ts)) || !Number.isFinite(Number(open))) return 'malformed candle row';
      const ageH = (Date.now() - Number(ts)) / 3_600_000;
      if (ageH > 6) return `newest candle is ${ageH.toFixed(1)}h old`;
      return null;
    },
  },
  {
    name: 'okx-candles rejects a bad instId',
    path: '/api/data/okx-candles?instId=EVIL-USDT&bar=1H&limit=5',
    required: true,
    expectStatus: 400,
    check: () => null,
  },
  {
    name: 'klines (legacy, shipped clients)',
    path: '/api/data/klines?symbol=BTCUSDT&interval=1h&limit=5',
    // Binance blocks CF egress, so this rides the OKX fallback. Grouped: on its
    // own it should not fail a deploy, but if it is down AND every other chart
    // source is down, the group fails and the run goes red.
    group: CHART_GROUP,
    check: (b) => {
      if (!Array.isArray(b) || b.length === 0) return 'no rows returned';
      if (!Array.isArray(b[0]) || b[0].length < 6) return 'row is not a kline tuple';
      if (Number(b[0][0]) > Number(b[b.length - 1][0])) return 'rows are newest-first (expected oldest-first)';
      return null;
    },
  },
  {
    name: 'coingecko (chart fallback)',
    path: '/api/data/coingecko?endpoint=coins/ohlc&coin_id=bitcoin&vs_currency=usd&days=90',
    // NB: this proxy takes coin_id, not id — an `id=` probe 400s and looks like
    // an outage. Also ~5 req/min anonymous, so a 429 here is normal — which is
    // exactly why it cannot be the only thing keeping the group green, and why
    // the group needs every member down before it fails.
    group: CHART_GROUP,
    check: (b) => (Array.isArray(b) && b.length > 0 ? null : 'no OHLC rows returned'),
  },
];

/**
 * Decide FAIL / WARN / ok for every result, applying group semantics.
 *
 * Pure and exported so the rule can be unit-tested without a deployment —
 * the outcome that matters here is a decision, and a decision that can only be
 * observed by redeploying is a decision nobody checks.
 *
 * @param {Array<{name:string, problem:string|null, required?:boolean, group?:string}>} results
 * @returns {{verdicts:Array<{name:string,level:'ok'|'warn'|'fail',problem:string|null}>,
 *            failed:number, advisory:number, degradedGroups:string[]}}
 */
export function classifyResults(results) {
  // A group survives if ANY member passed.
  const groupHasPass = new Map();
  for (const r of results) {
    if (!r.group) continue;
    groupHasPass.set(r.group, (groupHasPass.get(r.group) || false) || !r.problem);
  }

  const verdicts = [];
  let failed = 0;
  let advisory = 0;
  const degradedGroups = new Set();

  for (const r of results) {
    if (!r.problem) { verdicts.push({ name: r.name, level: 'ok', problem: null }); continue; }

    if (r.group) {
      if (groupHasPass.get(r.group)) {
        // A sibling is serving: visible, but not a merge blocker.
        advisory++;
        degradedGroups.add(r.group);
        verdicts.push({ name: r.name, level: 'warn', problem: r.problem });
      } else {
        // Every source for this capability is down — the thing the check
        // exists to catch.
        failed++;
        verdicts.push({ name: r.name, level: 'fail', problem: r.problem });
      }
      continue;
    }

    if (r.required) { failed++; verdicts.push({ name: r.name, level: 'fail', problem: r.problem }); }
    else { advisory++; verdicts.push({ name: r.name, level: 'warn', problem: r.problem }); }
  }

  return { verdicts, failed, advisory, degradedGroups: [...degradedGroups] };
}

async function run() {

  const results = [];

  const ready = await waitForFunctions(CHECKS[0].path);
  if (!ready) {
    console.error(`
FAIL  deployment never served /api/* — ${base}`);
    process.exit(1);
  }

  for (const c of CHECKS) {
    const url = `${base}${c.path}`;
    const expect = c.expectStatus ?? 200;
    let res, body, problem = null;

    // Upstream exchanges rate-limit (OKX is 40 req/2s per IP, shared across a
    // Cloudflare egress address), so a single blip must not read as an outage.
    // Retry before declaring failure — but never retry away a persistent fault:
    // ATTEMPTS is small and the last problem is what gets reported.
    const ATTEMPTS = 3;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      res = undefined; body = undefined; problem = null;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        problem = `request failed: ${e.message}`;
      }

      if (!problem) {
        if (res.status !== expect) {
          problem = `HTTP ${res.status} (expected ${expect})`;
        } else if (expect === 200) {
          try {
            body = await res.json();
          } catch {
            problem = 'response was not JSON';
          }
          if (!problem) problem = c.check(body, res);
        }
      }

      if (!problem) break;
      if (attempt < ATTEMPTS) await sleep(3_000);
    }

    const source = res?.headers?.get?.('X-Veyrnox-Source');
    results.push({
      name: c.name,
      problem,
      required: c.required,
      group: c.group,
      note: source ? ` [source: ${source}]` : '',
    });
  }

  const { verdicts, failed, advisory, degradedGroups } = classifyResults(results);
  const noteFor = new Map(results.map((r) => [r.name, r.note]));

  for (const v of verdicts) {
    const note = noteFor.get(v.name) || '';
    if (v.level === 'fail') console.error(`FAIL  ${v.name}${note} — ${v.problem}`);
    else if (v.level === 'warn') console.warn(`WARN  ${v.name}${note} — ${v.problem}`);
    else console.log(`ok    ${v.name}${note}`);
  }

  for (const g of degradedGroups) {
    // Say it plainly: the capability is up on a fallback, which is not the same
    // as healthy, and a run that goes green here should not read as "all fine".
    console.warn(`NOTE  group "${g}" is DEGRADED — a source is down but a fallback is serving. Not blocking.`);
  }

  console.log(`\n${CHECKS.length - failed - advisory} ok, ${advisory} advisory, ${failed} failed — ${base}`);
  if (failed) process.exit(1);
}

// Execute only as a CLI, never on import.
if (IS_MAIN) run();
