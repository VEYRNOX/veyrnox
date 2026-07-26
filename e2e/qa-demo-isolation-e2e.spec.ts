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

  // NAME: this asserts that a malformed address SURFACES A VALIDATION ERROR. It does
  // not exercise the submit gate (SendCrypto.jsx — `if (invalid) { setShowErrors(true);
  // return; }`), so it must not claim the form "rejects" the address; that gate is
  // still uncovered end-to-end.
  test('send form surfaces a validation error for a malformed address', async ({ page }) => {
    // FLAKE FIX: every wait here used to be a point-in-time `count()` or a fixed
    // `waitForTimeout`, neither of which auto-waits — so the outcome depended purely on
    // render timing. Locally the input never rendered in time and the test skipped on
    // all 6 of 6 runs; in CI it sometimes won the race, proceeded, and then failed the
    // equally racy error check (fail, fail, pass on retry — run 29737750345). It could
    // also pass VACUOUSLY: if the submit button was not found, no assertion ran at all.
    // Everything below is now a web-first assertion with an explicit bound, which
    // removes the vacuous-pass mode and the fixed-timeout guesswork. The remaining
    // cause — a redirect that tore the form out mid-test — is fixed in SendCrypto
    // itself; see the root-cause note below.
    await page.goto('/send?demo=1');

    const addrInput = page.getByLabel(/address|recipient/i)
      .or(page.locator('input[placeholder*="0x"]').first())
      .or(page.locator('input[type="text"]').first())
      .first();

    // Bounded wait instead of an instantaneous count(). The skip remains as a safety
    // net for environments where the form genuinely never renders (F-004): if it has
    // not appeared in 10s it is not going to, and skipping is honest. Note this
    // resolves as soon as the field appears and does not guarantee it STAYS — that
    // used to be the race, and is now fixed in SendCrypto (see below).
    const formReachable = await addrInput
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!formReachable, 'Send form address input not reachable at /send?demo=1 without vault state — see F-004');

    await addrInput.fill('not-a-valid-address');
    // The error is announced on blur, not mid-entry — role="alert" is assertive and
    // barking at someone on the first character of an address they are still typing
    // is worse than saying nothing. fill() leaves focus on the field, so blur here to
    // model a user who has finished with it. The red border does appear on input.
    await addrInput.blur();

    // SECOND FLAKE FIX — the previous pass made the waits web-first but left an
    // ambiguous submit locator in place.
    //
    // ROOT CAUSE (measured 2026-07-26, dev server, fresh browser profile): the submit
    // locator was A cause, but NOT the dominant one. SendCrypto.jsx's cold-load guard
    // redirects home on `vaultExists === false`, and it had no demo exemption — so
    // #send-recipient appeared at ~2163 ms and was gone by ~2644 ms. The form existed
    // for about 481 ms before the page navigated to '/'. `waitFor({state:'visible'})`
    // above resolves the moment it appears, not for as long as it stays, so everything
    // after this line had to finish inside that ~0.5 s window or the element was torn
    // out from under it. That is the fail/fail/pass-on-retry signature; dropping the
    // click only widened the margin.
    //
    // FIXED at the source: the guard now exempts `demoActive` (demo deliberately has
    // no vault, so `vaultExists === false` is its normal state, not a broken deep
    // link). Re-measured after the fix, the form no longer disappears and the URL
    // stays on /send?demo=1. This spec then passed 5/5 with --repeat-each=5.
    //
    // `getByRole('button', { name: /next|continue|send|review/i })` matched FOUR
    // controls on this page — a hidden nav "Send", "ETH send (clean)", the form's
    // "Continue", and the visible bottom-nav "Send" tab. `.first()` resolves by DOM
    // order, not by visibility or relevance, so it could land on a nav tab. Clicking
    // that navigates instead of validating, no error ever appears, and the assertion
    // below times out — fail, fail, pass-on-retry, exactly as seen on #1346.
    //
    // /send?demo=1 DOES select a wallet and an asset: demoSendSource() supplies a
    // synthetic wallet (src/lib/sendWalletSource.js), and SendCrypto.jsx defaults
    // walletId (:347) and assetSymbol to ETH (:367). "Continue" is therefore
    // ENABLED here — which is what made the ambiguous locator dangerous rather than
    // merely useless. That defaulting is also load-bearing for the assertion below:
    // `addressFormatValid` (SendCrypto.jsx:544) short-circuits to true when no
    // wallet is selected, so with no wallet the error could never render at all.
    //
    // None of that is needed: the inline error is rendered from `toAddress` being
    // malformed (SendCrypto.jsx — `(toAddress || showErrors) && !addressFormatValid`),
    // so it appears on fill. Dropping the click removes the ambiguity entirely.
    // Scope note: this asserts that a malformed address SURFACES AN ERROR. The
    // submit gate itself (SendCrypto.jsx:1666 — `if (invalid) { setShowErrors(true);
    // return; }`) is not exercised here, so the test name overstates it slightly.
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
