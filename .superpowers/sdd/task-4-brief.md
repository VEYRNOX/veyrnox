## Global Constraints

- Node 22, npm 11 (match existing CI).
- `npm install --legacy-peer-deps` (match existing CI).
- `VITE_ENV_LABEL` must be set to `"Staging"` for preview builds so the `EnvBadge` component renders visibly — production (main) deploys must NOT set it.
- `VITE_WALLETCONNECT_PROJECT_ID` must be injected (match existing CI).
- Never set `VITE_RELEASE=1` for staging (no obfuscation — debugging must be possible).
- Never set `VITE_DEMO_MODE=1` for staging (staging must mirror real behavior).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are NOT injected into staging builds — staging must not write to production Supabase (I2/I3 safety).
- The `prebuild` script (`node scripts/bundle-trezor-connect.mjs`) runs automatically via npm's `prebuild` hook when `npm run build` is called — do not invoke it separately.

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
