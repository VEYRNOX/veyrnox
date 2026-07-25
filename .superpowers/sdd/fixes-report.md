# Final review fixes — staging environment CI pipeline

## FIX 1 (Critical) — Duplicate/conflicting CSP in `public/_headers`
Removed the `Content-Security-Policy` line from `public/_headers`. The audited CSP in
`index.html` remains the single source of truth. Kept the other 4 headers
(X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).

## FIX 2 (Important) — `deploy-preview.yml` build step
Build step now conditional on `github.ref`:
- `refs/heads/main` -> `npm run build`
- everything else -> `npm run build:staging` (blanks Supabase vars via `.env.staging`,
  sets `VITE_ENV_LABEL=Staging` / `VITE_ENV=staging` internally)

Removed the now-redundant `echo "VITE_ENV_LABEL=Staging" >> "$GITHUB_ENV"` line from the
"Set environment label" step, since `build:staging` already sets that var for non-main
builds.

## FIX 3 (Important) — Playwright `webServer` vs staging project
`webServer` in `playwright.config.ts` is now `undefined` when `STAGING_URL` is set, so
`--project=staging` runs against the deployed preview instead of spawning `npm run dev`.

## FIX 4 (Important) — URL injection in PR comment script
`.github/workflows/deploy-preview.yml` "Comment preview URL on PR" step now passes the
deploy URL via an `env: DEPLOY_URL` and reads it with `process.env.DEPLOY_URL` inside the
`actions/github-script@v9` script, instead of interpolating
`${{ steps.deploy.outputs.deployment-url }}` directly into the JS source.

## Verification
- Re-read all 3 edited files after editing; confirmed:
  - `public/_headers` has 4 header lines, no CSP line.
  - `deploy-preview.yml` Build step branches on `github.ref`; PR-comment step uses
    `env.DEPLOY_URL` / `process.env.DEPLOY_URL`.
  - `playwright.config.ts` webServer is `process.env.STAGING_URL ? undefined : {...}`.
- Confirmed `build:staging` script exists in `package.json`
  (`"build:staging": "cross-env VITE_ENV_LABEL=Staging VITE_ENV=staging npm run build"`).

## Files changed
- `public/_headers`
- `.github/workflows/deploy-preview.yml`
- `playwright.config.ts`
