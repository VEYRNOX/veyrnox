// e2e/staging-smoke.spec.js — the ONLY spec that runs against a deployed build.
//
// WHY THIS EXISTS, AND WHY THE REST OF THE SUITE DOES NOT RUN HERE
//
// Seven specs (webauthn-prf-kek, presign-risk-verdict,
// revenuecat-entitlement-failclosed, i3-deniability-egress,
// passkey-clone-replay, rasp-automation-detection, send-broadcast.harness-b)
// reach into module internals at runtime, e.g.
//
//     page.evaluate(() => import('/src/wallet-core/keystore/web.js'))
//
// That path only resolves when Vite is serving source in DEV. Against a built,
// hashed, static deployment there is no /src/**, so those imports 404 and the
// tests fail — 26 of them did, for exactly this reason, not because anything
// was wrong with the deployment. They are module-boundary tests wearing a
// browser as a harness, and their correct home is the local dev server, where
// `web-e2e-tests` already runs the full suite.
//
// So the deployed-preview check is scoped to what a deployment check can
// honestly assert: the artifact we just published actually boots, and it is
// built with the staging configuration rather than the production one.
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test.describe('staging preview smoke', () => {
  test('the published build boots and renders the app shell', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    const res = await page.goto(`${BASE}/?demo=0`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'preview should serve the app').toBeLessThan(400);

    // The SPA must actually mount — a white screen still returns 200, so
    // asserting on the response alone would be a false pass.
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByText(/VEYRNOX/i).first()).toBeVisible({ timeout: 30_000 });

    // Chunk-load and module-resolution failures surface here; they are the
    // usual way a deploy is broken while still returning 200.
    const fatal = errors.filter((e) => /Failed to fetch dynamically imported|ChunkLoadError|Unexpected token|MIME type/i.test(e));
    expect(fatal, `fatal console errors: ${fatal.join(' | ')}`).toHaveLength(0);
  });

  test('SPA deep links resolve instead of 404ing', async ({ page }) => {
    // Cloudflare Pages needs the SPA fallback wired for client-side routes;
    // without it a refresh on any route 404s while the root still works.
    const res = await page.goto(`${BASE}/terms-legal`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'deep link should not 404').toBeLessThan(400);
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  });

  // Guards the real deployment artifact, not just the build script: staging
  // must be built in `staging` mode so .env.staging blanks Supabase. When that
  // regressed, build:staging silently produced a bundle wired to PRODUCTION
  // Supabase — which is how test runs once wrote 126 rows to the live events
  // table. A unit test cannot catch this; only inspecting what shipped can.
  test('the published bundle carries no Supabase project URL', async ({ page, request }) => {
    await page.goto(`${BASE}/?demo=0`, { waitUntil: 'domcontentloaded' });

    const scripts = await page.locator('script[src]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('src')).filter(Boolean)
    );
    expect(scripts.length, 'expected at least one bundled script').toBeGreaterThan(0);

    const offenders = [];
    for (const src of scripts) {
      const url = new URL(src, BASE).toString();
      const body = await (await request.get(url)).text();
      const hit = body.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/i);
      if (hit) offenders.push(`${src} -> ${hit[0]}`);
    }
    expect(offenders, `staging bundle embeds a Supabase project URL: ${offenders.join(', ')}`)
      .toHaveLength(0);
  });
});
