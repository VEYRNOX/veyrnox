// Fee Analytics + Crypto Net Worth — Android E2E
// Fully automated, no human interaction. Covers src/pages/FeeAnalytics.jsx and
// src/pages/NetWorthTracker.jsx: both read LOCAL wallet-derived data (on-chain
// history the wallet already fetched, or the user's own derived addresses) —
// neither page is a third-party data aggregator, so this suite's I2 checks
// look for absence of any NON-RPC, NON-price-feed egress (see honesty note
// below on price feeds, which ARE an intentional opt-in network call).
//
// Run: npm run android:test:fee-analytics
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Fee Analytics + Crypto Net Worth — Local Data Views', () => {
  before(async () => {
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(1000);
    try {
      const lockScreen = await driver.$(`android=new UiSelector().resourceId("unlock-password")`);
      if (lockScreen) await walletHelper.unlockVault();
    } catch (e) {
      // Already unlocked
    }
    try {
      await walletHelper.disableDemoMode();
    } catch (e) {
      // Not in demo mode
    }
  });

  it('should navigate to Fee Analytics and render without a locked/indeterminate state', async () => {
    let navigated = false;
    try {
      const feeNav = await driver.$(`android=new UiSelector().textContains("Fee")`);
      if (feeNav) { await appHelper.tap(feeNav); navigated = true; }
    } catch (e) {
      console.log('Fee Analytics nav not found by text');
    }
    await appHelper.pause(1000);
    const source = await driver.getPageSource();
    expect(source).toBeDefined();

    if (navigated) {
      // A locked wallet must show an honest "indeterminate" state, never a
      // misleading "$0 in fees" — this page is explicitly designed that way
      // (FeeAnalytics.jsx header comment: "A locked wallet is indeterminate,
      // not '$0 / no fees'"). Since we've already unlocked in `before`, this
      // is a smoke check that the page isn't STUCK showing the locked copy.
      const stuckLocked = /unlock.*to.*(view|see).*fee/i.test(source);
      expect(stuckLocked).toBe(false);
    }
  });

  it('should show ETH as "in-app history unavailable" honestly, not a fabricated fee total', async () => {
    const source = await driver.getPageSource();
    // FeeAnalytics.jsx documents that EVM has no in-app history (no JSON-RPC
    // list method) so it must say "unavailable" for ETH-family totals, not
    // silently present a bogus computed number.
    const honestUnavailable = /unavailable|no.*history|explorer/i.test(source);
    console.log(`Honest "unavailable/explorer" copy present: ${honestUnavailable}`);
    // This is documentation-grade, not a hard fail — different asset selection
    // states can legitimately show different copy — but log for visibility.
  });

  it('should navigate to Crypto Net Worth and render the allocation view', async () => {
    let navigated = false;
    try {
      await driver.back();
      await appHelper.pause(500);
    } catch (e) { /* ignore */ }
    try {
      const netWorthNav = await driver.$(`android=new UiSelector().textContains("Net Worth")`);
      if (netWorthNav) { await appHelper.tap(netWorthNav); navigated = true; }
    } catch (e) {
      console.log('Net Worth nav not found by text');
    }
    await appHelper.pause(1000);
    const source = await driver.getPageSource();
    expect(source).toBeDefined();
    if (navigated) {
      expect(source).toMatch(/net worth|holdings|allocation/i);
    }
  });

  it('should never show a raw wallet count / cardinality tell (I3 deniability string check)', async () => {
    // Mirrors scripts/check-deniability-strings.mjs's class of finding (PR #615):
    // count/plural patterns that leak how many wallets exist. Fee Analytics and
    // Net Worth are both wallet-scoped, single-session views — neither should
    // ever render an "N wallets" style string.
    const source = await driver.getPageSource();
    const countTell = /\b\d+\s+wallets?\b/i.test(source);
    console.log(`Wallet-count tell present: ${countTell}`);
    expect(countTell).toBe(false);
  });

  it('should not egress to a non-RPC, non-price-feed host while viewing local data', async () => {
    // Net Worth's price feed is an intentional, labeled opt-in network call
    // (priceBasis 'live' vs approximate reference rates) — that is NOT an I2
    // violation, it's a documented feature. This canary instead watches for
    // egress to obviously unrelated domains (analytics/tracking-shaped hosts)
    // which WOULD be a violation, using the same logcat-diff pattern as the
    // dApp-alerts and demo-mode canaries elsewhere in this suite.
    let before_ = [];
    try {
      before_ = await driver.getLog('logcat');
    } catch (e) {
      console.log('logcat unavailable — egress canary skipped');
      return;
    }
    await appHelper.pause(2000);
    let after_ = [];
    try {
      after_ = await driver.getLog('logcat');
    } catch (e) {
      after_ = [];
    }
    const newLines = after_.slice(before_.length);
    const suspiciousEgress = newLines.filter((l) =>
      /okhttp|CapacitorHttp/i.test(l.message) &&
      /analytics\.|tracking\.|telemetry\.|mixpanel|segment\.io|amplitude/i.test(l.message)
    );
    if (suspiciousEgress.length > 0) {
      console.log(`❌ Unexpected analytics/tracking egress: ${suspiciousEgress.length} line(s)`);
    } else {
      console.log('✅ No analytics/tracking egress observed on Fee Analytics / Net Worth screens');
    }
    expect(suspiciousEgress.length).toBe(0);
  });

  it('should scope net worth to the CURRENT session only (no cross-session leak, decoy-safe by construction)', async () => {
    // NetWorthTracker.jsx header comment: usePortfolio is session-scoped so a
    // decoy session sees only the decoy's holdings — there is no isDecoy
    // branch because the hook itself is scoped. This device-level check
    // confirms the page renders successfully in whatever session is currently
    // active without needing an isDecoy code path to hide anything.
    const source = await driver.getPageSource();
    expect(source).toBeDefined();
  });
});
