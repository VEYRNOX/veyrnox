# perf/ — Supabase RPC load tests

k6 script that drives Veyrnox's hardened Supabase RPCs on a **staging** project.

## Guards

The script refuses to run unless `SUPABASE_URL` matches `staging|preview|localhost|127.0.0.1`.
Add prod hosts to `PROD_HOSTS` in the script to make the guard louder.

## Local run

```bash
export SUPABASE_URL="https://<staging-ref>.supabase.co"
export SUPABASE_ANON_KEY="<staging anon key>"
export PROFILE=smoke   # smoke | load | soak
k6 run perf/supabase-rpcs.k6.js
```

## Profiles

| Profile | Shape | Use |
|---|---|---|
| `smoke` | 2 VUs × 30s | PR gate, catches breakage fast |
| `load`  | ramp 0→25 VUs over 5m | Weekly, real throughput picture |
| `soak`  | 10 VUs × 30m | Manual, look for leaks / drift |

## What it exercises

Each scenario mints its own device UUID per VU so per-device rate limits
(60/hr `track_event`, 1/device dedup `increment_referral`, etc.) are hit
across many buckets rather than piling on one.

`track_event`, `generate_referral_code`, `register_referral_code`,
`increment_referral`. A 429 or `rate.?limit`-shaped 400 is counted as an
*accepted* response — throttling is correct behaviour, not a failure.

### Referral code lifecycle (issue #1495)

`setup()` seeds a pool of ~30 real codes by calling
`generate_referral_code` once per code before any VU starts. Runtime scenarios
that need an existing code (`register_referral_code`, `increment_referral`)
pick a random code from that pool per iteration instead of minting a fresh
`K6xxxxxx` string.

Before this, both scenarios called the RPCs against codes that had never
been inserted into the `referrals` table, so the RPCs correctly rejected
them and drove `http_req_failed` to ~45%. That masked any real regression
those RPCs might have. Post-fix, `http_req_failed < 2%` reflects genuine
transport / rate-limit signal.

Setup uses fresh `uuidv4()` per generate call to sidestep
`generate_referral_code`'s 1-per-device rate limit — this is a seeding
operation and not the shape a real client makes. Runtime scenarios keep
their existing `deviceId()` / `STICKY_DEVICE` behaviour unchanged.

### `record_attribution` — deliberately not in the smoke rig

`record_attribution` was moved to `service_role`-only by H-3
(see `sql/api-security-hardening.sql`). The anon key the smoke rig uses
can no longer reach it, so calling it here would 401/403 and fail the
`http_req_failed` threshold. It's now omitted from the k6 scenarios and
its per-RPC latency threshold is gone.

If a run needs to measure it, add a separate `service_role`-scoped
profile that the workflow only allows on manual `workflow_dispatch`,
never on schedule — a service-role bearer must not sit in a scheduled
GitHub Actions run.

## Thresholds (fail CI)

- `http_req_failed < 2%`
- `http_req_duration p95 < 800ms` global; per-RPC 600–700 ms
- `checks{kind:accepted} > 98%`

## Web perf (Lighthouse-CI)

Runs in the `perf-web` workflow against a built `dist/` served on `:4173`.

- `lighthouserc.json` — LHCI budgets on 5 demo-mode routes (cold-load).
  Perf score ≥ 0.80, LCP < 2.5s, FCP < 2s, CLS < 0.1, TBT < 300ms.
  Calibrated from run 30422987700 where 4/5 routes passed all
  assertions and root came in at 0.83.

## Not covered (yet)

- **Warm-wallet perf.** Attempted with Playwright but the measure loop
  (`page.evaluate` after `page.goto`) was blocked by the app's cold-start
  JS load — `page.evaluate` couldn't run, tests hit the per-test timeout.
  LHCI works because it uses CDP directly rather than in-page evaluate.
  Follow-up: warm-wallet perf via CDP `Performance.enable` or a rewrite
  around Playwright's tracing API.
- Edge Function `first-referral-bonus` — needs a valid `Authorization`
  bearer and a real code that just passed `record_attribution`. Add as a
  chained scenario when the staging pipeline can mint one.
