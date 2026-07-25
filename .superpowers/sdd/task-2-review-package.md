# Task 2 Review Package

## Commits
02eb8c43 ci: add Cloudflare Pages deploy workflow with PR previews

## Stat
 .github/workflows/deploy-preview.yml | 97 ++++++++++++++++++++++++++++++++++++
 1 file changed, 97 insertions(+)

## Diff
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
