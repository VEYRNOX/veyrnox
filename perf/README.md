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
`increment_referral`, `record_attribution`. A 429 or `rate.?limit`-shaped 400
is counted as an *accepted* response — throttling is correct behaviour, not
a failure.

## Thresholds (fail CI)

- `http_req_failed < 2%`
- `http_req_duration p95 < 800ms` global; per-RPC 400–600 ms
- `checks{kind:accepted} > 98%`

## Web perf (Playwright + Lighthouse-CI)

Runs in the same `perf-web` workflow against a built `dist/` served on `:4173`.

- `lighthouserc.json` — LHCI budgets on 5 demo-mode routes (cold-load).
- `web-perf.spec.js` — Playwright nav timings on the same demo routes,
  browser-native `PerformanceObserver`.
- `warm-wallet-perf.spec.js` — same measurement shape on **authenticated**
  routes (`/`, `/send`, `/receive`, `/analytics`, `/tax`, `/alerts`) after a
  real onboarding pass in `beforeAll`. Sequential, one BrowserContext for the
  whole file (Playwright `storageState` doesn't persist IndexedDB, and the
  vault lives in IDB).

### Warm-wallet modes

| `WARM_WALLET_MODE` | What happens | Use |
|---|---|---|
| `create` (default) | Real seed gen + KDF, no chain state | Deterministic, isolated |
| `import`           | Imports `VITE_TEST_THROWAWAY_SEED`   | Adds real balance-of-zero RPC — reflects the network path |

`import` mode needs `VITE_TEST_THROWAWAY_SEED` set (repo secret in CI, or
`.env.test` locally — same source the e2e suite already uses).

### Local warm run

```bash
npm run build
npx serve -s dist -l 4173 &
BASE_URL=http://localhost:4173 npx playwright test \
  --config=perf/playwright.perf.config.js warm-wallet-perf.spec.js
```

## Not covered (yet)

- Edge Function `first-referral-bonus` — needs a valid `Authorization`
  bearer and a real code that just passed `record_attribution`. Add as a
  chained scenario when the staging pipeline can mint one.
- Send/Receive **interactions** (form fill, QR render, gas estimate) —
  currently warm perf measures nav only. Extend `warm-wallet-perf.spec.js`
  with per-interaction `performance.mark()` pairs when you want that.
