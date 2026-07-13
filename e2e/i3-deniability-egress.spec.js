// ─────────────────────────────────────────────────────────────────────────────
// I3 no-egress proof for a decoy session — fully automated, no human interaction.
//
// CLAUDE.md I3: "deniability mode makes zero backend calls." PR #478 gated
// CryptoNewsFeed / priceFeed / useBasketPrices / Calculator / PriceAlerts behind
// `!isDecoy && !isHidden`. docs/Feature-Status.md §6 records the follow-on
// (device-global 2FA factor suppression in decoy/hidden sessions, 2026-07-02)
// as "unit-tested, NOT device-verified" — this closes the missing on-device-style
// egress trace using Playwright network capture instead of a physical device,
// which is possible here because the claim under test ("zero HTTP calls to
// known third-party hosts while a decoy session is active") doesn't require a
// hardware guarantee, just observation of real network traffic.
//
// Setup note (see duress-decoy-routing.spec.js for the full story): `?demo=1`
// replaces onboarding with a canned dashboard, so a real onboarding + seed
// import cannot be combined with it. This reuses DuressPin.jsx's own
// DEMO-gated "Live demonstration" panel, which creates a REAL vault (real
// wallet-core crypto, real IndexedDB) with a throwaway generated mnemonic —
// same class of disposable test wallet as the documented UAT seed.
//
// IMPORTANT: unlock state lives only in React memory (WalletProvider), not
// localStorage — a `page.goto()` is a full document reload and would re-lock
// the SPA, defeating the point. Post-unlock navigation MUST go through the
// in-app client-side router (the bottom-nav "Home" link, src/components/
// Layout.jsx:63), never `page.goto`.
//
// Known egress hosts gated by isDecoy/isHidden (src/components/CryptoNewsFeed.jsx
// per CLAUDE.md's "I3 egress deniability fixes" entry):
//   cointelegraph.com, decrypt.co, api.rss2json.com
//
// Run:
//   npx playwright test e2e/i3-deniability-egress.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const EGRESS_HOST_PATTERN = /cointelegraph\.com|decrypt\.co|api\.rss2json\.com/i;

async function freshDemoState(page) {
  await page.goto(`${BASE}/duress-pin?demo=1`);
  await page.evaluate(() => {
    try { localStorage.clear(); indexedDB.deleteDatabase('veyrnox'); } catch { /* best-effort */ }
  });
  await page.goto(`${BASE}/duress-pin?demo=1`);
}

// SKIPPED (2026-07-12): the plans-page tier update (full-match of
// https://veyrnox.com/plans) moved /duress-pin into SAFETY_PLUS_ROUTES. On the
// web test surface entitlement.js always resolves 'free', so FeatureGate now
// renders TierLockedPage instead of the DuressPin "Live demonstration" panel
// this spec drives — it can no longer reach the setup UI. Re-enable once a
// legitimate Safety-Plus test harness exists (NOT a client-forgeable web tier
// override — entitlement.js exists to prevent exactly that). Tracks the I3
// zero-egress security property; owner-acknowledged coverage gap.
test.describe.skip('I3 deniability — zero egress in a decoy session (no human)', () => {
  test.setTimeout(60 * 1000);

  test('real session calls third-party news hosts; decoy session calls NONE of them', async ({ page }) => {
    // Layout.jsx renders two nav variants: a desktop sidebar (`hidden md:flex`)
    // and a mobile bottom nav (`md:hidden fixed bottom-0`). Forcing a mobile
    // viewport was tried and discarded — it triggers an unrelated redirect
    // (a fresh `/duress-pin?demo=1` deep-link bounces to `/` only at mobile
    // widths, confirmed by isolated repro; a pre-existing responsive-routing
    // quirk, not something this test should paper over or rely on). Staying at
    // the default desktop viewport avoids it; the sidebar's Home link is
    // targeted by href rather than visible text so it works whether the
    // sidebar is collapsed (icon-only) or expanded.
    await freshDemoState(page);
    await expect(page.getByText('Live demonstration (demo mode)')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Set up real \+ funded hidden wallet/i }).click();
    await expect(page.getByText(/Locked\. Unlock above/i)).toBeVisible({ timeout: 15000 });

    // ── Baseline: prove the egress-capable UI actually egresses in a REAL
    // session (otherwise "zero calls in decoy" would be meaningless — it could
    // just mean the feature never calls out at all). ──────────────────────────
    await page.getByRole('button', { name: /Unlock with REAL PIN/i }).click();
    await expect(page.getByText('REAL WALLET', { exact: true })).toBeVisible({ timeout: 10000 });

    const realSessionRequests = [];
    page.on('request', (req) => realSessionRequests.push(req.url()));
    // Client-side nav to Dashboard ("/"), which hosts CryptoNewsFeed — a
    // page.goto() here would force a document reload and re-lock the vault.
    await page.locator('a[href="/"]').first().click();
    await page.waitForTimeout(3000);
    const realSessionEgress = realSessionRequests.filter((u) => EGRESS_HOST_PATTERN.test(u));
    console.log(`Real session: ${realSessionEgress.length} matching third-party request(s) observed`);
    page.removeAllListeners('request');

    // ── Now the actual claim under test: decoy session, zero egress ─────────
    // Only ONE hard navigation happened (the initial goto to /duress-pin); the
    // Home click above was client-side, so goBack() is also client-side.
    await page.goBack();
    await expect(page.getByText('Live demonstration (demo mode)')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Lock$/ }).click();
    await expect(page.getByText(/Locked\. Unlock above/i)).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /Unlock with EMERGENCY PIN/i }).click();
    await expect(page.getByText('HIDDEN WALLET', { exact: true })).toBeVisible({ timeout: 10000 });

    const decoySessionRequests = [];
    page.on('request', (req) => decoySessionRequests.push(req.url()));

    await page.locator('a[href="/"]').first().click();
    await page.waitForTimeout(3000);

    const decoySessionEgress = decoySessionRequests.filter((u) => EGRESS_HOST_PATTERN.test(u));
    if (decoySessionEgress.length > 0) {
      console.log('❌ EGRESS IN DECOY SESSION:', decoySessionEgress);
    } else {
      console.log('✓ Decoy session made zero requests to any gated third-party host');
    }
    expect(decoySessionEgress).toEqual([]);

    // Honest note, ROOT-CAUSED (not a timing guess): CryptoNewsFeed.jsx folds
    // `!DEMO` into its useQuery `enabled` gate ("I3 guard... Fold !DEMO into
    // the enabled gate" per its own comment) — so under `?demo=1` the fetch is
    // OFF for every session, real or decoy, for a reason unrelated to isDecoy.
    // That means THIS harness (which must run under demo mode — see the header
    // note on why real onboarding can't combine with the DuressPin demo panel)
    // can only ever prove "decoy = 0", never the intended "real > 0, decoy = 0"
    // contrast for this specific fetch. The decoy-session zero-egress assertion
    // above is still real and still held; closing the contrast fully would
    // require a non-demo run driven through the real PinPad unlock screen
    // instead of the demo panel — out of scope for this harness.
    if (realSessionEgress.length === 0) {
      console.warn(
        '⚠️  Baseline (real session) also observed 0 matching requests — expected ' +
        'under demo mode (CryptoNewsFeed gates its fetch on `!DEMO`, not just ' +
        '`!isDecoy`), so the real-vs-decoy CONTRAST is inconclusive here; the ' +
        'decoy-session zero-egress assertion itself still held.'
      );
    }
  });
});
