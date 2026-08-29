// e2e/canary-smoke.spec.js — deployed-artifact smoke for the dedicated canary lane.
//
// This intentionally stays small and production-adjacent. It verifies the
// published bundle boots, deep links resolve, the canary label is visible, and
// the built artifact does not silently embed a production Supabase project URL.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test.describe('canary release smoke', () => {
  test.skip(!process.env.BASE_URL, 'canary smoke requires BASE_URL');

  test('the published canary boots and renders the app shell', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    const res = await page.goto(`${BASE}/?demo=0`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'canary should serve the app').toBeLessThan(400);

    const root = page.locator('#root');
    await expect(root).not.toBeEmpty({ timeout: 30_000 });
    await expect(page.getByText(/VEYRNOX/i).first()).toBeVisible({ timeout: 30_000 });

    const fatal = errors.filter((e) => /Failed to fetch dynamically imported|ChunkLoadError|Unexpected token|MIME type/i.test(e));
    expect(fatal, `fatal console errors: ${fatal.join(' | ')}`).toHaveLength(0);
  });

  test('the canary badge is present so the artifact cannot be mistaken for production', async ({ page }) => {
    await page.goto(`${BASE}/?demo=0`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('CANARY')).toBeVisible({ timeout: 30_000 });
  });

  test('SPA deep links resolve instead of 404ing', async ({ page }) => {
    const res = await page.goto(`${BASE}/terms-legal`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'deep link should not 404').toBeLessThan(400);
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  });

  test('the published canary bundle carries no Supabase project URL', async ({ page, request }) => {
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
    expect(offenders, `canary bundle embeds a Supabase project URL: ${offenders.join(', ')}`)
      .toHaveLength(0);
  });
});
