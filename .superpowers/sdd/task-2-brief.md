## Global Constraints

- Node 22, npm 11 (match existing CI).
- `npm install --legacy-peer-deps` (match existing CI).
- `VITE_ENV_LABEL` must be set to `"Staging"` for preview builds so the `EnvBadge` component renders visibly — production (main) deploys must NOT set it.
- `VITE_WALLETCONNECT_PROJECT_ID` must be injected (match existing CI).
- Never set `VITE_RELEASE=1` for staging (no obfuscation — debugging must be possible).
- Never set `VITE_DEMO_MODE=1` for staging (staging must mirror real behavior).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are NOT injected into staging builds — staging must not write to production Supabase (I2/I3 safety).
- The `prebuild` script (`node scripts/bundle-trezor-connect.mjs`) runs automatically via npm's `prebuild` hook when `npm run build` is called — do not invoke it separately.

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
