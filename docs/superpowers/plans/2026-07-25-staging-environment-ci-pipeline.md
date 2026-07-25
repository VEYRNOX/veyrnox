# Staging Environment & CI Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy every PR and main-branch push to Cloudflare Pages as a web preview, run E2E tests against each preview, and provide one-click rollback for the production (main) deployment.

**Architecture:** Cloudflare Pages hosts the Vite `dist/` output as a static site. Every PR gets an isolated preview URL (`<hash>.<project>.pages.dev`). Main-branch pushes deploy to the production URL. A new GitHub Actions workflow deploys the build, waits for the URL, then runs Playwright E2E against it. A separate `rollback.yml` workflow provides one-click rollback via `wrangler pages deployment rollback`.

**Tech Stack:** Cloudflare Pages (via Wrangler CLI), GitHub Actions, Playwright, existing Vite build pipeline.

## Global Constraints

- Node 22, npm 11 (match existing CI).
- `npm install --legacy-peer-deps` (match existing CI).
- `VITE_ENV_LABEL` must be set to `"Staging"` for preview builds so the `EnvBadge` component renders visibly — production (main) deploys must NOT set it.
- `VITE_WALLETCONNECT_PROJECT_ID` must be injected (match existing CI).
- Never set `VITE_RELEASE=1` for staging (no obfuscation — debugging must be possible).
- Never set `VITE_DEMO_MODE=1` for staging (staging must mirror real behavior).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are NOT injected into staging builds — staging must not write to production Supabase (I2/I3 safety).
- The `prebuild` script (`node scripts/bundle-trezor-connect.mjs`) runs automatically via npm's `prebuild` hook when `npm run build` is called — do not invoke it separately.

---

### Task 1: Cloudflare Pages Project Setup & Wrangler Config

**Files:**
- Create: `wrangler.toml`
- Create: `public/_headers`
- Modify: `.gitignore` (add wrangler artifacts)

**Interfaces:**
- Consumes: nothing
- Produces: `wrangler.toml` config consumed by the deploy workflow (Task 2). `public/_headers` sets security headers on the deployed site.

- [ ] **Step 1: Create `wrangler.toml`**

```toml
# Cloudflare Pages deployment config.
# Project must be created first: `npx wrangler pages project create veyrnox-staging`
name = "veyrnox-staging"

[pages]
build_output_dir = "dist"
```

- [ ] **Step 2: Create `public/_headers`**

Cloudflare Pages serves `_headers` from the build output. Vite copies `public/` into `dist/` at build time.

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org; font-src 'self' data:; frame-ancestors 'none'
```

- [ ] **Step 3: Add wrangler artifacts to `.gitignore`**

Append to the existing `.gitignore`:

```
# Wrangler (Cloudflare Pages CLI)
.wrangler/
```

- [ ] **Step 4: Create the Cloudflare Pages project**

This is a one-time manual step. The repo owner runs:

```bash
npx wrangler pages project create veyrnox-staging --production-branch main
```

Then adds these GitHub Actions secrets:
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard → Account ID
- `CLOUDFLARE_API_TOKEN` — API token with `Cloudflare Pages:Edit` permission

- [ ] **Step 5: Commit**

```bash
git add wrangler.toml public/_headers .gitignore
git commit -m "chore: add Cloudflare Pages config and security headers"
```

---

### Task 2: Deploy Workflow (PR Previews + Production)

**Files:**
- Create: `.github/workflows/deploy-preview.yml`

**Interfaces:**
- Consumes: `wrangler.toml` (Task 1), Cloudflare secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`), repo variable `VITE_WALLETCONNECT_PROJECT_ID`
- Produces: `deployment_url` output consumed by the staging E2E job (Task 3). Posts a PR comment with the preview URL.

- [ ] **Step 1: Create `.github/workflows/deploy-preview.yml`**

```yaml
name: Deploy Preview

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  deployments: write

env:
  VITE_WALLETCONNECT_PROJECT_ID: ${{ vars.VITE_WALLETCONNECT_PROJECT_ID }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    outputs:
      deployment_url: ${{ steps.deploy.outputs.deployment-url }}
      environment: ${{ steps.set-env.outputs.environment }}
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - run: npm install -g npm@11
      - run: npm install --legacy-peer-deps

      - name: Set environment label
        id: set-env
        run: |
          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "environment=production" >> "$GITHUB_OUTPUT"
          else
            echo "environment=preview" >> "$GITHUB_OUTPUT"
            echo "VITE_ENV_LABEL=Staging" >> "$GITHUB_ENV"
          fi

      - name: Build
        run: npm run build

      - name: Deploy to Cloudflare Pages
        id: deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=veyrnox-staging --branch=${{ github.head_ref || github.ref_name }}

      - name: Comment preview URL on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v9
        with:
          script: |
            const url = '${{ steps.deploy.outputs.deployment-url }}';
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const sha = context.sha.substring(0, 7);

            // Find and update existing bot comment instead of spamming new ones.
            const comments = await github.rest.issues.listComments({
              owner, repo, issue_number, per_page: 100,
            });
            const marker = '<!-- cloudflare-pages-preview -->';
            const existing = comments.data.find(c => c.body.includes(marker));

            const body = [
              marker,
              `**Preview deployed** (${sha})`,
              '',
              `${url}`,
              '',
              'E2E tests will run against this preview automatically.',
            ].join('\n');

            if (existing) {
              await github.rest.issues.updateComment({
                owner, repo, comment_id: existing.id, body,
              });
            } else {
              await github.rest.issues.createComment({
                owner, repo, issue_number, body,
              });
            }

      - name: Set deployment status
        if: always()
        run: echo "Deployed to ${{ steps.deploy.outputs.deployment-url }}"
```

- [ ] **Step 2: Verify the workflow YAML is valid**

```bash
npx yaml-lint .github/workflows/deploy-preview.yml || python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-preview.yml'))"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-preview.yml
git commit -m "ci: add Cloudflare Pages deploy workflow with PR previews"
```

---

### Task 3: Staging E2E Tests

**Files:**
- Create: `.github/workflows/staging-e2e.yml`
- Modify: `playwright.config.ts` (add staging project)

**Interfaces:**
- Consumes: `deployment_url` output from the deploy job (Task 2)
- Produces: Playwright HTML report as a CI artifact. Pass/fail status as a required check.

- [ ] **Step 1: Add a `staging` project to `playwright.config.ts`**

Add a new project entry after the existing `chromium` project. This project uses no `webServer` (the app is already deployed) and gets its `baseURL` from the `STAGING_URL` env var.

Insert after line 44 (after the closing `},` of the chromium project and before the closing `],` of `projects`):

```typescript
    {
      name: 'staging',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.STAGING_URL || 'http://localhost:5173',
      },
    },
```

The `webServer` block already has `reuseExistingServer: !process.env.CI`, and the staging workflow will set `--project=staging` so Playwright won't try to start the dev server for the staging project.

- [ ] **Step 2: Create `.github/workflows/staging-e2e.yml`**

```yaml
name: Staging E2E

on:
  workflow_run:
    workflows: ["Deploy Preview"]
    types: [completed]

permissions:
  contents: read
  checks: write
  actions: read

jobs:
  e2e:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v5
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - run: npm install -g npm@11
      - run: npm install --legacy-peer-deps

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Resolve preview URL
        id: url
        uses: actions/github-script@v9
        with:
          script: |
            // Find the deployment URL from the Deploy Preview workflow run.
            const runId = context.payload.workflow_run.id;
            const { owner, repo } = context.repo;

            // Get the jobs for the workflow run to extract the deployment URL
            // from the deploy step output.
            const jobs = await github.rest.actions.listJobsForWorkflowRun({
              owner, repo, run_id: runId,
            });
            const deployJob = jobs.data.jobs.find(j => j.name === 'deploy');
            if (!deployJob) {
              core.setFailed('Could not find deploy job');
              return;
            }

            // Read the deployment URL from the job's step annotations.
            // Fallback: construct it from the branch name.
            const branch = context.payload.workflow_run.head_branch;
            const slug = branch.replace(/[^a-z0-9-]/gi, '-').substring(0, 28);
            const previewUrl = `https://${slug}.veyrnox-staging.pages.dev`;

            core.setOutput('url', previewUrl);
            core.info(`Preview URL: ${previewUrl}`);

      - name: Wait for preview to be reachable
        run: |
          URL="${{ steps.url.outputs.url }}"
          echo "Waiting for $URL to respond..."
          for i in $(seq 1 30); do
            if curl -sf -o /dev/null "$URL"; then
              echo "Preview is up after ${i}0 seconds"
              exit 0
            fi
            sleep 10
          done
          echo "::error::Preview at $URL did not become reachable within 5 minutes"
          exit 1

      - name: Run Playwright E2E against staging
        run: npx playwright test --project=staging
        env:
          STAGING_URL: ${{ steps.url.outputs.url }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: staging-e2e-report
          path: playwright-report/
          retention-days: 14

      - name: Report check status
        if: always()
        uses: actions/github-script@v9
        with:
          script: |
            const { owner, repo } = context.repo;
            const sha = context.payload.workflow_run.head_sha;
            await github.rest.repos.createCommitStatus({
              owner, repo, sha,
              state: '${{ job.status }}' === 'success' ? 'success' : 'failure',
              target_url: `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`,
              description: 'E2E tests against staging preview',
              context: 'staging-e2e',
            });
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts .github/workflows/staging-e2e.yml
git commit -m "ci: add staging E2E tests triggered by preview deployments"
```

---

### Task 4: One-Click Rollback Workflow

**Files:**
- Create: `.github/workflows/rollback.yml`

**Interfaces:**
- Consumes: Cloudflare secrets (same as Task 2). Takes a `deployment_id` input (found in the Cloudflare dashboard or via `wrangler pages deployment list`).
- Produces: Rolls back the production deployment. Posts a summary in the workflow run.

- [ ] **Step 1: Create `.github/workflows/rollback.yml`**

```yaml
name: Rollback Production

on:
  workflow_dispatch:
    inputs:
      deployment_id:
        description: >
          Deployment ID to roll back to (from `wrangler pages deployment list`
          or Cloudflare dashboard). Leave blank to roll back to the previous
          deployment.
        required: false
        type: string
      confirm:
        description: 'Type "rollback" to confirm'
        required: true
        type: string

permissions:
  contents: read
  deployments: write

jobs:
  rollback:
    runs-on: ubuntu-latest
    if: ${{ github.event.inputs.confirm == 'rollback' }}
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22

      - name: List recent deployments
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deployment list --project-name=veyrnox-staging

      - name: Rollback deployment
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: >-
            pages deployment rollback
            --project-name=veyrnox-staging
            ${{ github.event.inputs.deployment_id && format('--deployment-id={0}', github.event.inputs.deployment_id) }}
            --x-versions

      - name: Post summary
        run: |
          echo "### Rollback complete" >> "$GITHUB_STEP_SUMMARY"
          if [ -n "${{ github.event.inputs.deployment_id }}" ]; then
            echo "Rolled back to deployment \`${{ github.event.inputs.deployment_id }}\`" >> "$GITHUB_STEP_SUMMARY"
          else
            echo "Rolled back to the previous production deployment" >> "$GITHUB_STEP_SUMMARY"
          fi
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "Triggered by: @${{ github.actor }}" >> "$GITHUB_STEP_SUMMARY"

  rejected:
    runs-on: ubuntu-latest
    if: ${{ github.event.inputs.confirm != 'rollback' }}
    steps:
      - run: |
          echo "::error::Rollback not confirmed. You must type 'rollback' in the confirm field."
          exit 1
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/rollback.yml
git commit -m "ci: add one-click production rollback workflow"
```

---

### Task 5: Environment Configuration & Documentation

**Files:**
- Create: `.env.staging`
- Modify: `.env.example` (document staging vars)

**Interfaces:**
- Consumes: nothing
- Produces: `.env.staging` consumed by developers running staging builds locally.

- [ ] **Step 1: Create `.env.staging`**

This file documents the staging-specific env vars. It is NOT git-ignored — it contains no secrets (only public config). Secrets live in GitHub Actions secrets.

```env
# Staging environment configuration.
# Used by `npm run build:staging` and the Deploy Preview CI workflow.
# No secrets here — those are in GitHub Actions secrets.

VITE_ENV_LABEL=Staging
VITE_ENV=staging

# Staging does NOT connect to production Supabase.
# Analytics and referral tracking are disabled in staging.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Add `build:staging` script to `package.json`**

Add after the `build:uat` line in package.json scripts:

```json
"build:staging": "cross-env VITE_ENV_LABEL=Staging VITE_ENV=staging npm run build",
```

- [ ] **Step 3: Add staging section to `.env.example`**

Append after the existing `VITE_ENV` documentation:

```env
# ── Staging ─────────────────────────────────────────────────
# Staging builds use .env.staging (checked in, no secrets).
# CI injects VITE_WALLETCONNECT_PROJECT_ID from Actions variables.
# Supabase is intentionally blanked — staging must not write to prod.
```

- [ ] **Step 4: Commit**

```bash
git add .env.staging package.json .env.example
git commit -m "chore: add staging env config and build:staging script"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Staging environment mirroring production: Task 1 (Cloudflare Pages) + Task 5 (env config). The build uses the same `npm run build` as CI, same Node/npm versions.
   - PR preview deployments: Task 2 (`deploy-preview.yml`), every PR gets a unique URL.
   - CI tests against staging: Task 3 (`staging-e2e.yml`), Playwright runs against the deployed preview.
   - One-click rollback: Task 4 (`rollback.yml`), `workflow_dispatch` with confirmation.

2. **Placeholder scan:** No TBDs, TODOs, or vague steps found.

3. **Type consistency:** `deployment_url` / `deployment-url` matches the `cloudflare/wrangler-action@v3` output name. `STAGING_URL` env var matches between Task 3 workflow and the Playwright config addition.

---

## Setup Checklist (for the repo owner)

Before the first deploy works, these one-time steps are needed:

1. Create the Cloudflare Pages project:
   ```bash
   npx wrangler pages project create veyrnox-staging --production-branch main
   ```

2. Add GitHub Actions secrets:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN` (needs `Cloudflare Pages:Edit` permission)

3. (Optional) Add `staging-e2e` as a required status check in branch protection rules if you want E2E results to gate merges.
