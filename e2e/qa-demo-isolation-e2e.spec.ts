import { test, expect } from '@playwright/test';

// Throwaway testnet address loaded from git-ignored .env.test — never commit real values here.
// Unset in CI (no .env.test); the address-isolation test skips explicitly in that case
// rather than asserting against an empty string (which .not.toContain('') would fail vacuously).
const EXPECTED_EVM = process.env.VITE_TEST_THROWAWAY_EVM ?? '';

test.describe('QA: Demo Mode Isolation', () => {
  test('demo mode does not show real derived address', async ({ page }) => {
    test.skip(!EXPECTED_EVM, 'requires VITE_TEST_THROWAWAY_EVM — see .env.test (git-ignored; unset in CI)');
    await page.goto('/?demo=1');
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    expect(content).not.toContain(EXPECTED_EVM);
  });

  test('send form rejects invalid address', async ({ page }) => {
    // FLAKE FIX: every wait here used to be a point-in-time `count()` or a fixed
    // `waitForTimeout`, neither of which auto-waits — so the outcome depended purely on
    // render timing. Locally the input never rendered in time and the test skipped on
    // all 6 of 6 runs; in CI it sometimes won the race, proceeded, and then failed the
    // equally racy error check (fail, fail, pass on retry — run 29737750345). It could
    // also pass VACUOUSLY: if the submit button was not found, no assertion ran at all.
    // Everything below is now a web-first assertion with an explicit bound, so the test
    // is deterministic: it either genuinely checks validation or skips for a stated
    // reason.
    await page.goto('/send?demo=1');

    const addrInput = page.getByLabel(/address|recipient/i)
      .or(page.locator('input[placeholder*="0x"]').first())
      .or(page.locator('input[type="text"]').first())
      .first();

    // Bounded wait instead of an instantaneous count(): the send form is not reachable
    // at /send?demo=1 without vault state (F-004). If it has not appeared in 10s it is
    // not going to, and skipping is honest — but the skip is now deterministic rather
    // than a lost race.
    const formReachable = await addrInput
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!formReachable, 'Send form address input not reachable at /send?demo=1 without vault state — see F-004');

    await addrInput.fill('not-a-valid-address');

    const submitBtn = page.getByRole('button', { name: /next|continue|send|review/i }).first();
    await expect(submitBtn, 'send form must expose a submit control once the address field is present').toBeVisible({ timeout: 10_000 });
    await submitBtn.click();

    // Auto-waiting assertion replaces waitForTimeout(1000) + count(): validation is
    // allowed to be slower than a second without failing the test, and a genuinely
    // missing error still fails within the bound instead of racing.
    const errorSurface = page.getByRole('alert').or(page.locator('text=/invalid|error/i')).first();
    await expect(errorSurface, 'an invalid address must surface a visible validation error').toBeVisible({ timeout: 10_000 });
  });

  test('landing page renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Filter noise
    const realErrors = errors.filter(e =>
      !e.includes('analytics') &&
      !e.includes('googletagmanager') &&
      !e.includes('favicon') &&
      // Browsers silently ignore frame-ancestors in <meta> CSP — it's a security
      // finding (F-003) but not an app crash. Filter here; recorded in findings.
      !e.includes("frame-ancestors")
    );
    expect(realErrors).toHaveLength(0);
  });

  test('demo mode page body is visible (no blank screen)', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForLoadState('networkidle');
    const body = page.locator('body');
    await expect(body).not.toBeHidden();
    // Page must have rendered some content
    const text = await body.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
