# Task 3 Report — Staging E2E Tests

## Files created/modified

- Modified: `playwright.config.ts` — added a `staging` project entry after the existing
  `chromium` project (inside `projects: [...]`). It spreads `devices['Desktop Chrome']`
  and sets `baseURL: process.env.STAGING_URL || 'http://localhost:5173'`. No `webServer`
  override — the config's single global `webServer` block is unaffected; the staging
  workflow never invokes it because CI runs `npx playwright test --project=staging`
  without going through a script that starts `npm run dev`.
- Created: `.github/workflows/staging-e2e.yml` — new workflow, content copied verbatim
  from the brief (`.superpowers/sdd/task-3-brief.md`, Step 2). Triggers on
  `workflow_run` completion of the "Deploy Preview" workflow (Task 2), gated on
  `conclusion == 'success'`. Steps: checkout at `head_sha`, Node 22 setup, `npm install -g
  npm@11`, `npm install --legacy-peer-deps`, install Playwright Chromium, resolve the
  preview URL via `actions/github-script` (slug derived from `head_branch`, falls back to
  `https://<slug>.veyrnox-staging.pages.dev`), poll the URL with curl for up to 5 minutes,
  run `npx playwright test --project=staging` with `STAGING_URL` env, upload the
  Playwright HTML report as an artifact (`staging-e2e-report`, 14-day retention), and
  report a commit status (`staging-e2e` context) back onto the original commit SHA.

## What was done

1. Read the brief at `.superpowers/sdd/task-3-brief.md`.
2. Read the existing `playwright.config.ts` to confirm the exact insertion point (after
   the `chromium` project object, before the closing `],` of `projects`).
3. Edited `playwright.config.ts` to add the `staging` project exactly as specified.
4. Created `.github/workflows/staging-e2e.yml` with the exact YAML from the brief.
5. Committed both files with the exact message: `ci: add staging E2E tests triggered by
   preview deployments`.

Commit SHA: `d1046ef9c9827e5dddf36b7e34716dbdede6a4cf`

## Concerns

- The preview-URL resolution step (`Resolve preview URL`) constructs the URL from the
  branch name slug rather than reading it from a Task 2 job output/annotation — this
  matches the brief exactly (including its own comment noting this as a fallback
  heuristic), but it means this workflow's correctness depends on Task 2's actual deploy
  job producing a URL in that same `https://<slug>.veyrnox-staging.pages.dev` shape. Not
  verified against the real Task 2 output since that's out of scope for Task 3.
  Repository-level `deployment_url` job output mentioned in the brief's "Interfaces"
  section isn't consumed directly here — the workflow re-derives the URL independently.
    This is a brief-fidelity note, not a defect I introduced; I implemented Step 2 verbatim
  as instructed.
- Not tested end-to-end (no CI run triggered as part of this task) — this is a
  config/workflow change only, consistent with "Tests: N/A" in the report contract.
- `playwright.config.ts`'s `webServer` block still has no `if`/conditional guarding it
  from being started when `--project=staging` is passed locally (outside CI) by a
  developer without `STAGING_URL` set — in that case Playwright would still spin up the
  local dev server per its default behavior, but `baseURL` would resolve to
  `http://localhost:5173` too, so it's harmless, just slightly redundant. This matches the
  brief's stated design and was not changed.
