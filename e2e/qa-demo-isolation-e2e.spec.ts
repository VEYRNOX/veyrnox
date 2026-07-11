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
    await page.goto('/send?demo=1');
    await page.waitForLoadState('networkidle');
    // Try to find and fill address input
    const addrInput = page.getByLabel(/address|recipient/i)
      .or(page.locator('input[placeholder*="0x"]').first())
      .or(page.locator('input[type="text"]').first());

    if (await addrInput.count() === 0) {
      test.skip(true, 'Send form address input not found at /send?demo=1 without vault state — see F-004');
      return;
    }

    await addrInput.fill('not-a-valid-address');
    const submitBtn = page.getByRole('button', { name: /next|continue|send|review/i }).first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
      const hasError = await page.getByRole('alert').count() > 0 ||
        await page.locator('text=/invalid|error/i').count() > 0;
      expect(hasError).toBe(true);
    }
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
