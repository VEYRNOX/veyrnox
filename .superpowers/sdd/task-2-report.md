# Task 2 Report — Deploy Workflow (PR Previews + Production)

## Files created

- `.github/workflows/deploy-preview.yml`

## What was done

1. Read `.superpowers/sdd/task-2-brief.md` for exact requirements.
2. Created `.github/workflows/deploy-preview.yml` with the content specified verbatim in
   Step 1 of the brief:
   - Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`.
   - `concurrency` group keyed on `github.ref` with `cancel-in-progress: true`.
   - `permissions`: `contents: read`, `pull-requests: write`, `deployments: write`.
   - `VITE_WALLETCONNECT_PROJECT_ID` injected at workflow-`env` level from the
     `vars.VITE_WALLETCONNECT_PROJECT_ID` repo variable (matches existing CI pattern).
   - Node/npm setup matches `ci.yml`: `actions/checkout@v5`, `actions/setup-node@v5`
     (node-version 22, `cache: npm`), `npm install -g npm@11`,
     `npm install --legacy-peer-deps`.
   - `Set environment label` step sets `environment=production` output for pushes to
     `refs/heads/main`; otherwise sets `environment=preview` and exports
     `VITE_ENV_LABEL=Staging` into `GITHUB_ENV` (so it is present for the `npm run build`
     step on preview builds only — production/main builds do not get `VITE_ENV_LABEL`).
   - `Build` step runs plain `npm run build` (the `prebuild` npm hook runs
     `scripts/bundle-trezor-connect.mjs` automatically — not invoked separately).
   - No `VITE_RELEASE`, no `VITE_DEMO_MODE`, no `VITE_SUPABASE_URL` /
     `VITE_SUPABASE_ANON_KEY` anywhere in the workflow, matching the constraint list.
   - `Deploy to Cloudflare Pages` step uses `cloudflare/wrangler-action@v3` with
     `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets, deploying `dist` to the
     `veyrnox-staging` Pages project on branch `${{ github.head_ref || github.ref_name }}`.
   - `Comment preview URL on PR` step (PR events only) uses `actions/github-script@v9` to
     find-or-update a single marker-tagged bot comment (`<!-- cloudflare-pages-preview -->`)
     rather than spamming a new comment per push.
   - `deployment_url` and `environment` job outputs exposed for downstream consumption
     (Task 3's staging E2E job).
3. Skipped Step 2 (YAML lint) per instructions — `yaml-lint`/`pyyaml` are not installed in
   this environment, and there is no ambiguity in the file since it was copied verbatim
   from the brief's fenced code block.
4. Committed with the exact message requested:
   `ci: add Cloudflare Pages deploy workflow with PR previews`.

## Concerns

- YAML validity was not tooling-verified (Step 2 skipped per task instructions). The file
  was written character-for-character from the brief's code fence, so risk is low, but a
  CI run (or manual `actions/*` schema check) is the first real validation.
- This workflow assumes the Cloudflare Pages project `veyrnox-staging` already exists and
  that `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` secrets and the
  `VITE_WALLETCONNECT_PROJECT_ID` repo variable are configured in GitHub — none of that
  was created or verified as part of this task (out of scope per the brief, presumably
  handled elsewhere or a prerequisite).
- Untracked files `.superpowers/` and
  `docs/superpowers/plans/2026-07-25-staging-environment-ci-pipeline.md` exist in the
  working tree but were intentionally left uncommitted (out of scope for this task's
  commit).
