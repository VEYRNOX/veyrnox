# GitHub Actions CI

**Date:** 2026-06-06
**Branch:** `chore/ci-github-actions` (off `main`)
**Status:** Approved design — ready for implementation plan

## Problem

The repo has **no CI** (no `.github/workflows`, no other CI config). The full
test suite (438 tests, including the regression guards: `routeAudit`,
`featureClassification`, the USD disclosure and spendable-asset-pricing guards),
`lint`, and `build` only run when a contributor manually runs them locally. PRs
show "no checks" (observed on #111). So every guard built so far is honor-system
only — nothing blocks a merge that breaks them.

## Goal & non-goals

**Goal:** a GitHub Actions workflow that runs `lint`, `build`, and `test` on every
pull request and on pushes to `main`, turning those into required-able status
checks.

**Non-goals:**
- **No `typecheck` in the gate.** `npm run typecheck` currently emits **1,584
  errors** because `jsconfig.json` sets `checkJs: true` over an essentially
  untyped JS/JSX codebase (`import.meta.env`, untyped shadcn/ui props, etc.). It
  has never passed; gating on it would block all merges. Excluded entirely;
  reducing those errors is a separate, large effort, out of scope here.
- **No production / source changes.** One new workflow file only.
- **No release/deploy/publish steps.** Verification only.

## What is green today (gateable)

Verified on `main`:
- `npm run lint` (`eslint . --quiet`) → exit 0.
- `npm run build` (`vite build`) → exit 0, produces `dist/`.
- `npm test` (`vitest run`) → 438 passed / 48 files. Its `pretest` hook
  (`node scripts/check-crypto-rng.mjs`) runs automatically, so the crypto-RNG
  guard is covered for free.
- `package-lock.json` is present → `npm ci` + `actions/setup-node` npm cache work.

## Component

A single workflow file — `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

# Cancel superseded runs on the same ref to save minutes.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### Design choices

- **One job, sequential steps.** No matrix (single Node version is enough; YAGNI).
  Step order `lint → build → test` puts the fast checks first so failures surface
  before the ~5–7 min test step (the 192 MiB Argon2id KDF makes the suite slow;
  it runs fine on `ubuntu-latest`, which has more RAM than vitest's parallelism
  cap needs).
- **Node 20 LTS** — no `engines` field pins a version, so we choose current LTS.
- **`npm ci`** (not `npm install`) — reproducible from `package-lock.json`, and
  `cache: npm` reuses the dependency cache across runs.
- **Triggers:** `pull_request` (the core goal — gate PRs) and `push` to `main`
  (catch direct pushes / confirm post-merge green).
- **`concurrency` + `permissions: contents: read`** — cancel obsolete runs;
  least-privilege token. Both one-liners, standard hygiene.

## Error handling / edge cases

- A failing `lint`/`build`/`test` step exits non-zero → the job fails → the PR
  check is red. That is the intended behavior.
- The suite's existing `testTimeout`/parallelism settings (in `vitest.config.js`)
  already account for the slow KDF; no CI-specific tuning needed.
- No secrets are required (no network/deploy), so forks' PRs run safely.

## Affected files

- `.github/workflows/ci.yml` — new. No other files.

## Testing / verification

CI cannot be fully exercised until it runs on GitHub. Verification plan:
1. **Local dry-run of the gated commands** (`npm run lint && npm run build && npm test`)
   confirms the three checks pass on the branch before relying on CI.
2. **YAML validity** — confirm the workflow parses (e.g. a YAML lint / `node`-based
   parse), since a malformed workflow silently does nothing.
3. **Live confirmation** — open the PR and confirm the `CI / verify` check appears
   and goes green. (After merge, optionally mark it a required check in branch
   protection — a GitHub settings action, noted but outside this file.)
