// ─────────────────────────────────────────────────────────────────────────────
// RASP browser-level automation detection — fully automated, no human interaction.
//
// src/rasp/browserProbe.js deliberately treats `navigator.webdriver === true` as
// HOOKED. Playwright (like every CDP/WebDriver-based tool) sets that flag by
// default — which means running THIS test IS the adversarial condition: no
// need to fake a rooted/Frida device (that's the still-unautomatable F-09 item,
// docs/Feature-Status.md), because the browser-level leg of RASP is exactly the
// thing Playwright naturally trips.
//
// Drives the real pipeline directly (src/rasp/index.js: detect, degrade,
// browserProbeSource; src/sign-gate/presign.js: presignGate) via a page-context
// dynamic import — the same precise, non-UI-guessing approach used in
// passkey-clone-replay.spec.js, and for the same reason: driving this through
// the full onboarding -> Send-page UI flow turned out to be blocked by an
// UNRELATED bug found while building this test (see the note below), and this
// test's actual claim — "the automation-detection leg fires on real automation,
// and BLOCK is unconditional" — doesn't need the UI at all to be proven honestly.
//
// FOUND BUG (out of scope here, flagged separately): after importing a seed
// through the real web onboarding flow, client-side navigation to /send
// briefly loads then immediately redirects back to "/" (confirmed via
// `framenavigated` events: .../send -> ... -> / within ~1s, 0 inputs ever
// render). Reproduced twice. Not investigated further here — this file's job
// is the automated tests, not that fix.
//
// Pipeline under test:
//   detect(browserProbeSource) -> CONDITION.HOOKED (webdriver flag)
//   -> degrade(...) -> { tier: TIER.BLOCK, sentence: "Another program appears
//      to be inspecting this app, so signing and key access are turned off
//      until it stops." }
//   -> presignGate(TIER.BLOCK, txLevel, acknowledged) -> signerReachable=false
//      UNCONDITIONALLY — even with acknowledged=true, unlike WARN/CONFIRM.
//
// Run:
//   npx playwright test e2e/rasp-automation-detection.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const HOOKED_SENTENCE =
  'Another program appears to be inspecting this app, so signing and key access are turned off until it stops.';

test.describe('RASP — browser automation detection blocks signing (no human)', () => {
  test.setTimeout(30 * 1000);

  test('navigator.webdriver=true (Playwright itself) trips HOOKED -> BLOCK, unconditionally', async ({ page }) => {
    await page.goto(`${BASE}/?demo=0`);

    // Sanity: confirm the condition this test relies on is actually present in
    // this browser context — otherwise a false pass could mean either "RASP is
    // broken" or "this browser wasn't actually flagged as automated".
    const webdriverFlag = await page.evaluate(() => navigator.webdriver);
    expect(webdriverFlag).toBe(true);
    console.log('✓ navigator.webdriver === true confirmed (this IS the HOOKED condition)');

    const result = await page.evaluate(async () => {
      const { detect, degrade, browserProbeSource, CONDITION, TIER } = await import('/src/rasp/index.js');
      const { presignGate } = await import('/src/sign-gate/presign.js');

      const condition = detect(browserProbeSource);
      const artifact = degrade(condition);

      // Try BOTH acknowledged=false and acknowledged=true — BLOCK must refuse
      // signing either way (the whole point of BLOCK vs WARN/CONFIRM).
      const gateUnacked = presignGate(artifact.tier, 'clean', false);
      const gateAcked = presignGate(artifact.tier, 'clean', true);

      return {
        condition,
        tier: artifact.tier,
        sentence: artifact.sentence,
        expectedTier: TIER.BLOCK,
        expectedCondition: CONDITION.HOOKED,
        gateUnacked,
        gateAcked,
      };
    });

    expect(result.condition).toBe(result.expectedCondition);
    console.log(`✓ detect(browserProbeSource) returned CONDITION.HOOKED`);

    expect(result.tier).toBe(result.expectedTier);
    console.log(`✓ degrade(HOOKED).tier === TIER.BLOCK`);

    expect(result.sentence).toBe(HOOKED_SENTENCE);
    console.log(`✓ degrade(HOOKED).sentence matches the exact UI copy: "${result.sentence}"`);

    expect(result.gateUnacked.signerReachable).toBe(false);
    expect(result.gateAcked.signerReachable).toBe(false);
    console.log('✓ presignGate signerReachable=false for BLOCK, both acknowledged=false AND acknowledged=true');
    console.log('  (BLOCK is unconditional — no acknowledgement can override it, unlike WARN/CONFIRM)');
  });
});
