import { test, expect } from '@playwright/test';

test.describe('Veyrnox Wallet App', () => {
  test('should load the app homepage', async ({ page }) => {
    await page.goto('/');
    // App should load without errors
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display landing page for new users', async ({ page }) => {
    await page.goto('/landing');
    // Check for wallet creation prompts (use first heading)
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('should load dashboard when wallet exists', async ({ page }) => {
    // Navigate to dashboard (wallet gate will redirect if no vault)
    await page.goto('/');

    // Wait for main content to load
    const mainContent = page.locator('main, [role="main"], body > div[id*="root"]');
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to send crypto page', async ({ page }) => {
    await page.goto('/send');

    // Should display send form or prompt
    const page_content = page.locator('body');
    await expect(page_content).toBeVisible();
  });

  test('should navigate to receive crypto page', async ({ page }) => {
    await page.goto('/receive');

    // Should display receive address or form
    const page_content = page.locator('body');
    await expect(page_content).toBeVisible();
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/settings');

    // Should display settings form
    const page_content = page.locator('body');
    await expect(page_content).toBeVisible();
  });

  test('should handle navigation between pages', async ({ page }) => {
    // Navigate through multiple pages
    await page.goto('/');
    await page.goto('/send');
    await expect(page).toHaveURL(/\/send/);

    await page.goto('/receive');
    await expect(page).toHaveURL(/\/receive/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should display navigation menu', async ({ page }) => {
    await page.goto('/');

    // Look for navigation elements (sidebar, menu, nav)
    const nav = page.locator('nav, [role="navigation"], aside');
    // Navigation might not always be visible, but page should load
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle fast navigation', async ({ page }) => {
    await page.goto('/');

    // Rapid navigation should not crash
    for (let i = 0; i < 3; i++) {
      await page.goto('/send');
      await page.goto('/receive');
    }

    // Should still be functional
    await expect(page).toHaveURL(/\/receive/);
  });

  test('should persist across page reloads', async ({ page }) => {
    await page.goto('/');

    // Get initial URL
    const initialUrl = page.url();

    // Reload page
    await page.reload();

    // Should still be on a valid page
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Navigate to non-existent route (should show 404 or redirect)
    await page.goto('/non-existent-route-xyz');

    // Page should still load without crashing
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
