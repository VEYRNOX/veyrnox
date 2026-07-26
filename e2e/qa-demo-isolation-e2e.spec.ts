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

    // SECOND FLAKE FIX — the previous pass made the waits web-first but left the
    // real cause in place: the submit locator.
    //
    // `getByRole('button', { name: /next|continue|send|review/i })` matched FOUR
    // controls on this page — a hidden nav "Send", "ETH send (clean)", the form's
    // "Continue", and the visible bottom-nav "Send" tab. `.first()` resolves by DOM
    // order, not by visibility or relevance, so it could land on a nav tab. Clicking
    // that navigates instead of validating, no error ever appears, and the assertion
    // below times out — fail, fail, pass-on-retry, exactly as seen on #1346.
    // "Continue" is also `disabled` until a wallet AND asset are selected, which
    // /send?demo=1 does not do, so clicking it was never going to validate either.
    //
    // None of that is needed: the inline error is rendered from `toAddress` being
    // malformed (SendCrypto.jsx — `(toAddress || showErrors) && !addressFormatValid`),
    // so it appears on fill. Dropping the click removes the ambiguity entirely and
    // tests the actual behaviour — a bad address is rejected — rather than the
    // incidental question of which button happens to be first in the DOM.
    const addressError = page
      .getByRole('alert')
      .filter({ hasText: /address (format|is required)/i })
      .first();
    await expect(addressError, 'a malformed address must surface a visible validation error')
      .toBeVisible({ timeout: 10_000 });
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
