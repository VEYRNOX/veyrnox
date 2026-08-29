# Canary Release Lane

This repo now includes a dedicated web canary lane in
[.github/workflows/canary-release.yml](/Users/aljobson/Documents/GitHub/veyrnox/.github/workflows/canary-release.yml).

## What It Is

- A production-adjacent Cloudflare Pages deployment to the fixed `canary` branch.
- Built with [`.env.canary`](/Users/aljobson/Documents/GitHub/veyrnox/.env.canary) via `vite build --mode canary`.
- Followed by:
  - edge endpoint probes via `scripts/check-edge-endpoints.mjs`
  - deployed-artifact smoke checks in [e2e/canary-smoke.spec.js](/Users/aljobson/Documents/GitHub/veyrnox/e2e/canary-smoke.spec.js)

## What It Is For

This is a confidence lane, not a rollout router.

Use it to answer:
- does the built artifact boot after deploy?
- do deep links still work on Pages?
- is the artifact clearly marked `CANARY` so nobody mistakes it for production?
- did the bundle accidentally embed a production Supabase project URL?
- do the deployed edge endpoints respond at all?

## Triggering

- Automatically on pushes to `main`
- Manually with `workflow_dispatch`, optionally against a specific ref or SHA

## Current Scope

- Web canary only
- Mobile already has a separate pre-production lane through Firebase Test Lab and staging store uploads; this workflow does not replace that
