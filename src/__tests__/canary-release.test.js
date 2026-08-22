// Static contract guard for the web canary lane.
//
// This pins the dedicated env/build/workflow pieces so a later edit cannot
// silently turn the canary lane back into a production deploy or stop running
// the built-artifact smoke checks.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const canaryEnv = read('.env.canary');
const workflow = read('.github/workflows/canary-release.yml');
const wrangler = read('wrangler.toml');
describe('canary release contract', () => {
  it('defines a dedicated canary env with a visible label and blanked Supabase', () => {
    expect(canaryEnv).toContain('VITE_ENV_LABEL=Canary');
    expect(canaryEnv).toContain('VITE_ENV=canary');
    expect(canaryEnv).toContain('VITE_SUPABASE_URL=');
    expect(canaryEnv).toContain('VITE_SUPABASE_ANON_KEY=');
    expect(canaryEnv).toContain('Client-side only:');
    expect(canaryEnv).toContain('Pages Functions are unaffected');
    expect(canaryEnv).toContain('VITE_BUY_ENABLED=true');
    expect(canaryEnv).toContain('VITE_TRANSAK_ENVIRONMENT=STAGING');
  });

  it('deploys the canary artifact to the dedicated Cloudflare canary branch', () => {
    expect(workflow).toContain('name: Canary Release');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('npx vite build --mode canary');
    expect(workflow).toContain('pages deploy dist --project-name=veyrnox-prod --branch=canary');
    expect(workflow).toContain('node scripts/check-edge-endpoints.mjs "$DEPLOY_URL"');
  });

  it('runs the deployed canary smoke and reports a dedicated gate', () => {
    expect(workflow).toContain('e2e/canary-smoke.spec.js');
    expect(workflow).toContain('BASE_URL: ${{ needs.deploy-canary.outputs.deployment_url }}');
    expect(workflow).toContain('canary-gate:');
    expect(workflow).toContain('Canary deployed and smoke checks passed');
  });

  it('pins preview and production ENVIRONMENT values in wrangler.toml', () => {
    expect(wrangler).toContain('[env.preview.vars]');
    expect(wrangler).toContain('ENVIRONMENT = "preview"');
    expect(wrangler).toContain('[env.production.vars]');
    expect(wrangler).toContain('ENVIRONMENT = "production"');
  });
});
