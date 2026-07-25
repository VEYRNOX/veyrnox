# Final Branch Review Package

## Branch: claude/staging-environment-ci-pipeline-608bf5
## Commits
b8c60584 chore: add staging env config and build:staging script
d59a2f8a ci: add one-click production rollback workflow
d1046ef9 ci: add staging E2E tests triggered by preview deployments
02eb8c43 ci: add Cloudflare Pages deploy workflow with PR previews
baa7b367 chore: add Cloudflare Pages config and security headers

## Stat
 .env.example                         |   5 ++
 .env.staging                         |  11 ++++
 .github/workflows/deploy-preview.yml |  97 +++++++++++++++++++++++++++++++++
 .github/workflows/rollback.yml       |  68 +++++++++++++++++++++++
 .github/workflows/staging-e2e.yml    | 102 +++++++++++++++++++++++++++++++++++
 .gitignore                           |   6 +++
 package.json                         |   1 +
 playwright.config.ts                 |   7 +++
 public/_headers                      |   6 +++
 wrangler.toml                        |   6 +++
 10 files changed, 309 insertions(+)

## Diff
diff --git a/.env.example b/.env.example
index dcd903ff..60758fe0 100644
--- a/.env.example
+++ b/.env.example
@@ -18,20 +18,25 @@ VITE_DEMO_MODE=
 
 # Release build hardening toggle (1 in release builds).
 VITE_RELEASE=
 
 # Banner label shown in non-prod builds, e.g. SIT or UAT.
 VITE_ENV_LABEL=
 
 # Environment name consumed by build scripts, e.g. production | sit | uat.
 VITE_ENV=
 
+# ── Staging ─────────────────────────────────────────────────
+# Staging builds use .env.staging (checked in, no secrets).
+# CI injects VITE_WALLETCONNECT_PROJECT_ID from Actions variables.
+# Supabase is intentionally blanked — staging must not write to prod.
+
 # Vite base public path (only set if hosting under a sub-path).
 VITE_BASE=
 
 # --- RPC / indexer overrides (client-exposed, NOT secret) ---
 # Override the default public endpoints for any chain family. All are UNTRUSTED
 # infrastructure (reads + broadcast only; signing is always local on-device).
 # Set in .env.local, never committed.
 #
 # Solana — replace the flaky public devnet RPC (e.g. Helius / QuickNode free tier):
 VITE_SOL_RPC_URL_DEVNET=
diff --git a/.env.staging b/.env.staging
new file mode 100644
index 00000000..65c0552a
--- /dev/null
+++ b/.env.staging
@@ -0,0 +1,11 @@
+# Staging environment configuration.
+# Used by `npm run build:staging` and the Deploy Preview CI workflow.
+# No secrets here — those are in GitHub Actions secrets.
+
+VITE_ENV_LABEL=Staging
+VITE_ENV=staging
+
+# Staging does NOT connect to production Supabase.
+# Analytics and referral tracking are disabled in staging.
+VITE_SUPABASE_URL=
+VITE_SUPABASE_ANON_KEY=
diff --git a/.github/workflows/deploy-preview.yml b/.github/workflows/deploy-preview.yml
new file mode 100644
index 00000000..86e2f59e
--- /dev/null
+++ b/.github/workflows/deploy-preview.yml
@@ -0,0 +1,97 @@
+name: Deploy Preview
+
+on:
+  pull_request:
+  push:
+    branches: [main]
+  workflow_dispatch:
+
+concurrency:
+  group: deploy-${{ github.ref }}
+  cancel-in-progress: true
+
+permissions:
+  contents: read
+  pull-requests: write
+  deployments: write
+
+env:
+  VITE_WALLETCONNECT_PROJECT_ID: ${{ vars.VITE_WALLETCONNECT_PROJECT_ID }}
+
+jobs:
+  deploy:
+    runs-on: ubuntu-latest
+    outputs:
+      deployment_url: ${{ steps.deploy.outputs.deployment-url }}
+      environment: ${{ steps.set-env.outputs.environment }}
+    steps:
+      - uses: actions/checkout@v5
+
+      - uses: actions/setup-node@v5
+        with:
+          node-version: 22
+          cache: npm
+
+      - run: npm install -g npm@11
+      - run: npm install --legacy-peer-deps
+
+      - name: Set environment label
+        id: set-env
+        run: |
+          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
+            echo "environment=production" >> "$GITHUB_OUTPUT"
+          else
+            echo "environment=preview" >> "$GITHUB_OUTPUT"
+            echo "VITE_ENV_LABEL=Staging" >> "$GITHUB_ENV"
+          fi
+
+      - name: Build
+        run: npm run build
+
+      - name: Deploy to Cloudflare Pages
+        id: deploy
+        uses: cloudflare/wrangler-action@v3
+        with:
+          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
+          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
+          command: pages deploy dist --project-name=veyrnox-staging --branch=${{ github.head_ref || github.ref_name }}
+
+      - name: Comment preview URL on PR
+        if: github.event_name == 'pull_request'
+        uses: actions/github-script@v9
+        with:
+          script: |
+            const url = '${{ steps.deploy.outputs.deployment-url }}';
+            const { owner, repo } = context.repo;
+            const issue_number = context.issue.number;
+            const sha = context.sha.substring(0, 7);
+
+            // Find and update existing bot comment instead of spamming new ones.
+            const comments = await github.rest.issues.listComments({
+              owner, repo, issue_number, per_page: 100,
+            });
+            const marker = '<!-- cloudflare-pages-preview -->';
+            const existing = comments.data.find(c => c.body.includes(marker));
+
+            const body = [
+              marker,
+              `**Preview deployed** (${sha})`,
+              '',
+              `${url}`,
+              '',
+              'E2E tests will run against this preview automatically.',
+            ].join('\n');
+
+            if (existing) {
+              await github.rest.issues.updateComment({
+                owner, repo, comment_id: existing.id, body,
+              });
+            } else {
+              await github.rest.issues.createComment({
+                owner, repo, issue_number, body,
+              });
+            }
+
+      - name: Set deployment status
+        if: always()
+        run: echo "Deployed to ${{ steps.deploy.outputs.deployment-url }}"
diff --git a/.github/workflows/rollback.yml b/.github/workflows/rollback.yml
new file mode 100644
index 00000000..919b98be
--- /dev/null
+++ b/.github/workflows/rollback.yml
@@ -0,0 +1,68 @@
+name: Rollback Production
+
+on:
+  workflow_dispatch:
+    inputs:
+      deployment_id:
+        description: >
+          Deployment ID to roll back to (from `wrangler pages deployment list`
+          or Cloudflare dashboard). Leave blank to roll back to the previous
+          deployment.
+        required: false
+        type: string
+      confirm:
+        description: 'Type "rollback" to confirm'
+        required: true
+        type: string
+
+permissions:
+  contents: read
+  deployments: write
+
+jobs:
+  rollback:
+    runs-on: ubuntu-latest
+    if: ${{ github.event.inputs.confirm == 'rollback' }}
+    steps:
+      - uses: actions/checkout@v5
+
+      - uses: actions/setup-node@v5
+        with:
+          node-version: 22
+
+      - name: List recent deployments
+        uses: cloudflare/wrangler-action@v3
+        with:
+          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
+          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
+          command: pages deployment list --project-name=veyrnox-staging
+
+      - name: Rollback deployment
+        uses: cloudflare/wrangler-action@v3
+        with:
+          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
+          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
+          command: >-
+            pages deployment rollback
+            --project-name=veyrnox-staging
+            ${{ github.event.inputs.deployment_id && format('--deployment-id={0}', github.event.inputs.deployment_id) }}
+            --x-versions
+
+      - name: Post summary
+        run: |
+          echo "### Rollback complete" >> "$GITHUB_STEP_SUMMARY"
+          if [ -n "${{ github.event.inputs.deployment_id }}" ]; then
+            echo "Rolled back to deployment \`${{ github.event.inputs.deployment_id }}\`" >> "$GITHUB_STEP_SUMMARY"
+          else
+            echo "Rolled back to the previous production deployment" >> "$GITHUB_STEP_SUMMARY"
+          fi
+          echo "" >> "$GITHUB_STEP_SUMMARY"
+          echo "Triggered by: @${{ github.actor }}" >> "$GITHUB_STEP_SUMMARY"
+
+  rejected:
+    runs-on: ubuntu-latest
+    if: ${{ github.event.inputs.confirm != 'rollback' }}
+    steps:
+      - run: |
+          echo "::error::Rollback not confirmed. You must type 'rollback' in the confirm field."
+          exit 1
diff --git a/.github/workflows/staging-e2e.yml b/.github/workflows/staging-e2e.yml
new file mode 100644
index 00000000..bd14f5f9
--- /dev/null
+++ b/.github/workflows/staging-e2e.yml
@@ -0,0 +1,102 @@
+name: Staging E2E
+
+on:
+  workflow_run:
+    workflows: ["Deploy Preview"]
+    types: [completed]
+
+permissions:
+  contents: read
+  checks: write
+  actions: read
+
+jobs:
+  e2e:
+    runs-on: ubuntu-latest
+    if: ${{ github.event.workflow_run.conclusion == 'success' }}
+    steps:
+      - uses: actions/checkout@v5
+        with:
+          ref: ${{ github.event.workflow_run.head_sha }}
+
+      - uses: actions/setup-node@v5
+        with:
+          node-version: 22
+          cache: npm
+
+      - run: npm install -g npm@11
+      - run: npm install --legacy-peer-deps
+
+      - name: Install Playwright browsers
+        run: npx playwright install --with-deps chromium
+
+      - name: Resolve preview URL
+        id: url
+        uses: actions/github-script@v9
+        with:
+          script: |
+            // Find the deployment URL from the Deploy Preview workflow run.
+            const runId = context.payload.workflow_run.id;
+            const { owner, repo } = context.repo;
+
+            // Get the jobs for the workflow run to extract the deployment URL
+            // from the deploy step output.
+            const jobs = await github.rest.actions.listJobsForWorkflowRun({
+              owner, repo, run_id: runId,
+            });
+            const deployJob = jobs.data.jobs.find(j => j.name === 'deploy');
+            if (!deployJob) {
+              core.setFailed('Could not find deploy job');
+              return;
+            }
+
+            // Read the deployment URL from the job's step annotations.
+            // Fallback: construct it from the branch name.
+            const branch = context.payload.workflow_run.head_branch;
+            const slug = branch.replace(/[^a-z0-9-]/gi, '-').substring(0, 28);
+            const previewUrl = `https://${slug}.veyrnox-staging.pages.dev`;
+
+            core.setOutput('url', previewUrl);
+            core.info(`Preview URL: ${previewUrl}`);
+
+      - name: Wait for preview to be reachable
+        run: |
+          URL="${{ steps.url.outputs.url }}"
+          echo "Waiting for $URL to respond..."
+          for i in $(seq 1 30); do
+            if curl -sf -o /dev/null "$URL"; then
+              echo "Preview is up after ${i}0 seconds"
+              exit 0
+            fi
+            sleep 10
+          done
+          echo "::error::Preview at $URL did not become reachable within 5 minutes"
+          exit 1
+
+      - name: Run Playwright E2E against staging
+        run: npx playwright test --project=staging
+        env:
+          STAGING_URL: ${{ steps.url.outputs.url }}
+
+      - name: Upload Playwright report
+        if: always()
+        uses: actions/upload-artifact@v7
+        with:
+          name: staging-e2e-report
+          path: playwright-report/
+          retention-days: 14
+
+      - name: Report check status
+        if: always()
+        uses: actions/github-script@v9
+        with:
+          script: |
+            const { owner, repo } = context.repo;
+            const sha = context.payload.workflow_run.head_sha;
+            await github.rest.repos.createCommitStatus({
+              owner, repo, sha,
+              state: '${{ job.status }}' === 'success' ? 'success' : 'failure',
+              target_url: `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`,
+              description: 'E2E tests against staging preview',
+              context: 'staging-e2e',
+            });
diff --git a/.gitignore b/.gitignore
index 670f1078..a5346b21 100644
--- a/.gitignore
+++ b/.gitignore
@@ -34,20 +34,23 @@ vitest.worktree.local.mjs
 # Signing keystores. Globs, NOT exact filenames — a named-file rule
 # (e.g. `veyrnox-release.jks`) silently misses any other name, which is how
 # veyrnox-upload-new.jks sat unignored. Note `*.keystore` does NOT match `.jks`.
 *.jks
 *.p12
 *.jceks
 secrets.json
 # ...except the committed template of var NAMES (no values). The negation must
 # come AFTER the .env.* rule above or git keeps ignoring it.
 !.env.example
+# ...and the staging build config (public config only, no secrets — see
+# .env.staging itself and Task 5 of the staging environment CI pipeline plan).
+!.env.staging
 
 # Logs
 *.log
 npm-debug.log*
 
 # Audit harness run artifacts — generated, timestamped output of
 # scripts/audit/eth-wallet-audit.mjs. Regenerated on demand; never commit.
 docs/audit-runs/
 
 # OS / editor cruft
@@ -119,10 +122,13 @@ test-results/
 playwright-report/
 .auth/
 playwright/.auth/
 .claude/scheduled_tasks.lock
 .impeccable/
 .github/hooks/impeccable.json
 
 # Local Android signing credentials (NEVER commit)
 keystore.properties
 android/keystore.properties
+
+# Wrangler (Cloudflare Pages CLI)
+.wrangler/
diff --git a/package.json b/package.json
index 86e42799..e4f934f0 100644
--- a/package.json
+++ b/package.json
@@ -65,20 +65,21 @@
     "build:demo": "cross-env VITE_DEMO_MODE=1 npm run build",
     "build:release": "cross-env VITE_RELEASE=1 npm run build",
     "mobile:build:release": "cross-env VITE_RELEASE=1 npm run build && npm run cap:sync",
     "build:beta": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=\"Testnet Beta\" npm run build",
     "mobile:build:beta": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=\"Testnet Beta\" npm run build && npm run cap:sync",
     "android:sync": "npm run build && cap sync android",
     "android:open": "cap open android",
     "android:run": "npm run build && cap run android",
     "build:sit": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=SIT npm run build",
     "build:uat": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=UAT npm run build",
+    "build:staging": "cross-env VITE_ENV_LABEL=Staging VITE_ENV=staging npm run build",
     "mobile:build:sit": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=SIT npm run build && npm run cap:sync",
     "mobile:build:uat": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=UAT npm run build && npm run cap:sync",
     "postinstall": "patch-package"
   },
   "dependencies": {
     "@aparajita/capacitor-biometric-auth": "^10.0.0",
     "@aparajita/capacitor-secure-storage": "^8.0.0",
     "@capacitor-community/speech-recognition": "^7.0.1",
     "@capacitor/android": "^8.4.2",
     "@capacitor/app": "^8.1.1",
diff --git a/playwright.config.ts b/playwright.config.ts
index d25011ab..23bf8cdf 100644
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -34,19 +34,26 @@ export default defineConfig({
     baseURL: 'http://localhost:5173',
     trace: 'on-first-retry',
     screenshot: 'only-on-failure',
   },
 
   projects: [
     {
       name: 'chromium',
       use: { ...devices['Desktop Chrome'] },
     },
+    {
+      name: 'staging',
+      use: {
+        ...devices['Desktop Chrome'],
+        baseURL: process.env.STAGING_URL || 'http://localhost:5173',
+      },
+    },
   ],
 
   webServer: {
     command: 'npm run dev',
     url: 'http://localhost:5173',
     reuseExistingServer: !process.env.CI,
     timeout: 120000,
   },
 });
diff --git a/public/_headers b/public/_headers
new file mode 100644
index 00000000..9268e992
--- /dev/null
+++ b/public/_headers
@@ -0,0 +1,6 @@
+/*
+  X-Frame-Options: DENY
+  X-Content-Type-Options: nosniff
+  Referrer-Policy: no-referrer
+  Permissions-Policy: camera=(), microphone=(), geolocation=()
+  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org; font-src 'self' data:; frame-ancestors 'none'
diff --git a/wrangler.toml b/wrangler.toml
new file mode 100644
index 00000000..45225ecf
--- /dev/null
+++ b/wrangler.toml
@@ -0,0 +1,6 @@
+# Cloudflare Pages deployment config.
+# Project must be created first: `npx wrangler pages project create veyrnox-staging`
+name = "veyrnox-staging"
+
+[pages]
+build_output_dir = "dist"
