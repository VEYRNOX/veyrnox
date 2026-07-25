## Global Constraints

- Node 22, npm 11 (match existing CI).
- `npm install --legacy-peer-deps` (match existing CI).
- `VITE_ENV_LABEL` must be set to `"Staging"` for preview builds so the `EnvBadge` component renders visibly — production (main) deploys must NOT set it.
- `VITE_WALLETCONNECT_PROJECT_ID` must be injected (match existing CI).
- Never set `VITE_RELEASE=1` for staging (no obfuscation — debugging must be possible).
- Never set `VITE_DEMO_MODE=1` for staging (staging must mirror real behavior).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are NOT injected into staging builds — staging must not write to production Supabase (I2/I3 safety).
- The `prebuild` script (`node scripts/bundle-trezor-connect.mjs`) runs automatically via npm's `prebuild` hook when `npm run build` is called — do not invoke it separately.

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
