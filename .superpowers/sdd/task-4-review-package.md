# Task 4 Review Package

## Commits
d59a2f8a ci: add one-click production rollback workflow

## Stat
 .github/workflows/rollback.yml | 68 ++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 68 insertions(+)

## Diff
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
